import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import QRCode from "qrcode";
import amqp from "amqplib";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "src", "templates"));
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

let channel, replyQueue;
const pendingResponses = new Map();

//  Inicializar conexión RabbitMQ
async function initRabbit() {
    try {
        const conn = await amqp.connect("amqp://localhost");
        channel = await conn.createChannel();
        const { queue } = await channel.assertQueue("", { exclusive: true });
        replyQueue = queue;
        console.log(" Reply queue creada:", replyQueue);

        //  Consumidor global
        channel.consume(replyQueue, (msg) => {
            const correlationId = msg.properties.correlationId;
            const content = JSON.parse(msg.content.toString());
            const pending = pendingResponses.get(correlationId);

            if (pending) {
                pending.resolve(content);
                pendingResponses.delete(correlationId);
            }
        }, { noAck: true });

    } catch (err) {
        console.error("[RabbitMQ] Error al conectar:", err);
    }
}
await initRabbit();


function sendRpcMessage(queue, message) {
    return new Promise((resolve, reject) => {
        const correlationId = uuidv4();

        pendingResponses.set(correlationId, { resolve, reject });

        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
            correlationId,
            replyTo: replyQueue,
        });


        setTimeout(() => {
            if (pendingResponses.has(correlationId)) {
                pendingResponses.delete(correlationId);
                reject(new Error("Timeout esperando respuesta del banco"));
            }
        }, 10000);
    });
}

//  Middleware autenticación
app.use((req, res, next) => {
    const pathsNoRedirect = ["/login", "/register", "/dni", "/qr"];
    if (pathsNoRedirect.includes(req.path)) return next();
    if (!req.cookies?.sesion) return res.redirect("/login");
    next();
});

//  Home
app.get("/", async (req, res) => {
    const usuarioId = req.cookies.sesion;
    try {
        const response = await sendRpcMessage("bank_queue", {
            operationType: "consultar",
            payload: { userId: usuarioId },
        });

        if (response.status === "ok") {
            const { cuenta } = response;
            res.render("home", {
                usuario: cuenta.usuario,
                saldo: cuenta.saldo,
                transacciones: cuenta.transacciones,
                error: null,
                mensaje: response.message,
                id: usuarioId,
            });
        } else {
            res.render("home", { usuario: "", saldo: 0, error: response.error, transacciones: [], id: usuarioId });
        }
    } catch (err) {
        res.render("home", { usuario: "", saldo: 0, error: err.message, transacciones: [], id: usuarioId });
    }
});

//  Login
app.get("/login", (req, res) => {
    if (req.cookies?.sesion) return res.redirect("/");
    res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const response = await sendRpcMessage("bank_queue", {
            operationType: "login",
            payload: { usuario, password },
        });

        if (response.status === "ok" && response.cuenta) {
            res.cookie("sesion", response.cuenta.id, { httpOnly: true });
            res.redirect("/");
        } else {
            res.render("login", { error: response.error || "Credenciales incorrectas" });
        }
    } catch (err) {
        res.render("login", { error: "No se recibió respuesta del banco" });
    }
});

//  Registro
app.get("/register", (req, res) => {
    if (req.cookies?.sesion) return res.redirect("/");
    res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
    const { usuario, password, confirmar, dni } = req.body;
    if (password !== confirmar)
        return res.render("register", { error: "Las contraseñas no coinciden" });

    try {
        const response = await sendRpcMessage("bank_queue", {
            operationType: "register",
            payload: { usuario, password, dni, saldo: 1000, transacciones: [] },
        });

        if (response.status === "ok") res.redirect("/login");
        else res.render("register", { error: response.error || "Error al registrar usuario" });
    } catch (err) {
        res.render("register", { error: "No se recibió respuesta del banco" });
    }
});

// Transferencia
app.post("/transfer", async (req, res) => {
    const { destino, monto } = req.body;
    const idOrigen = req.cookies.sesion;

    try {
        const response = await sendRpcMessage("bank_queue", {
            operationType: "transaction",
            payload: { idOrigen, idDestino: destino, monto: Number(monto) },
        });

        if (response.status === "ok" && response.cuenta) {
            res.json({
                saldo: response.cuenta.saldo,
                transacciones: response.cuenta.transacciones,
                mensaje: response.message
            });
        } else {
            res.json({ error: response.error || "Error en la transferencia" });
        }
    } catch {
        res.json({ error: "No se recibió respuesta del banco" });
    }
});


app.post("/prestamo", async (req, res) => {
    const { monto } = req.body;
    const idUsuario = req.cookies.sesion;

    try {
        const response = await sendRpcMessage("bank_queue", {
            operationType: "prestamo",
            payload: { idUsuario, monto: Number(monto) },
        });

        if (response.status === "ok" && response.cuenta) {
            res.json({
                saldo: response.cuenta.saldo,
                transacciones: response.cuenta.transacciones,
                mensaje: response.message
            });
        } else {
            res.json({ error: response.error || "Error en el préstamo" });
        }
    } catch {
        res.json({ error: "No se recibió respuesta del banco" });
    }
});

// Logout
app.get("/logout", (req, res) => {
    res.clearCookie("sesion");
    res.redirect("/login");
});

//  Consulta DNI
app.get("/dni", async (req, res) => {
    const { dni } = req.query;
    try {
        const response = await sendRpcMessage("reniec_queue", { dni });
        if (response.status === "ok" && response.persona) {
            res.json(response.persona);
        } else {
            res.status(404).json({ error: response.error || "No encontrado en RENIEC" });
        }
    } catch {
        res.status(500).json({ error: "No se recibió respuesta de RENIEC" });
    }
});

// 🪪 QR
function obfuscate(text) {
    const base64url = Buffer.from(text, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `Banco${base64url}`;
}

app.get("/qr", async (req, res) => {
    const userId = req.cookies.sesion;
    try {
        const obfuscatedId = obfuscate(userId);
        res.setHeader("Content-Type", "image/png");
        await QRCode.toFileStream(res, obfuscatedId, { width: 300 });
    } catch {
        res.status(500).send("Error generando QR");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(` Web App en http://localhost:${PORT}`));
