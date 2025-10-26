
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from 'cors';

import QRCode from "qrcode";




const app = express();

// Configurar EJS como motor de plantillas
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "src", "templates"));
app.use(express.static(path.join(process.cwd(), 'public')));

app.use(express.json())

app.use(cors());

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());





function obfuscate(text) {
    const base64url = Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `Banco${base64url}`;
}



app.get("/qr", async (req, res) => {
    const userId = req.cookies.sesion;
    try {
        const obfuscatedId = obfuscate(userId);
        res.setHeader('Content-Type', 'image/png');
        await QRCode.toFileStream(res, obfuscatedId, { width: 300 });
    } catch (err) {
        res.status(500).send("Error generando QR");
    }
});


// Middleware de autenticación 
app.use((req, res, next) => {
    const pathsNoRedirect = ["/login", "/register", "/dni"];
    if (pathsNoRedirect.includes(req.path)) {
        return next();
    }
    // Si no hay cookie de sesión, redirige a login
    if (!req.cookies || !req.cookies.sesion) {
        return res.redirect("/login");
    }
    next();
});



// Endpoint raíz: mostrar home si hay sesión
app.get("/", async (req, res) => {

    const usuarioId = req.cookies.sesion;
    if (!usuarioId) return res.redirect("/login");
    let user;
    let error = null;

    console.log(usuarioId);

    await fetch(`http://localhost:8000/consultar?userId=${usuarioId}`).then(async response => {
        if (response.ok) {
            user = await response.json()
        } else {

        }
    })

    console.log(user);

    const { usuario, saldo, transacciones } = user;
    return res.render("home", {
        usuario,
        saldo,
        error,
        mensaje: null,
        transacciones,
        id: usuarioId
    });

});

// Mostrar formulario de login
app.get("/login", (req, res) => {
    if (req.cookies && req.cookies.sesion) {
        return res.redirect("/");
    }
    res.render("login", { error: null });
});

// Procesar login
app.post("/login", async (req, res) => {
    const { usuario, password } = req.body;


    await fetch("http://localhost:8000/login", {
        method: "POST",
        headers: {
            "Content-type": "Application/Json"
        },
        body: JSON.stringify({
            usuario, password
        })
    }).then(async (response) => {
        if (response.ok) {
            const user = await response.json()
            res.cookie("sesion", user.id, { httpOnly: true })
            res.redirect("/")
        } else {
            res.render("login", { error: "Usuario o contraseña incorrectos" })
        }
    })

});

// Mostrar formulario de registro
app.get("/register", (req, res) => {
    if (req.cookies && req.cookies.sesion) {
        return res.redirect("/");
    }
    res.render("register", { error: null });
});

// Procesar registro
app.post("/register", async (req, res) => {
    const { usuario, password, confirmar, dni } = req.body;
    if (password !== confirmar) {
        return res.render("register", { error: "Las contraseñas no coinciden" });
    }

    await fetch("http://localhost:8000/register", {
        method: "POST",
        headers: {
            "Content-type": "Application/Json"
        },
        body: JSON.stringify({
            usuario,
            password,
            saldo: 0,
            transacciones: [],
            dni
        })

    }).then(response => {
        if (response.ok) {
            res.redirect("/login")
        }
    })


});

app.get("/logout", (req, res) => {
    res.clearCookie("sesion");
    res.redirect("/login");
})

app.post("/transfer", async (req, res) => {
    const { destino, monto } = req.body;
    const idOrigen = req.cookies.sesion;


    const response = await fetch("http://localhost:8000/transaction", {
        method: "POST",
        headers: {
            "Content-type": "application/json"
        },
        body: JSON.stringify({
            idOrigen: idOrigen,
            idDestino: destino,
            monto: Number(monto)
        })
    });

    if (response.ok) {

        const userRes = await fetch(`http://localhost:8000/consultar?userId=${idOrigen}`);
        if (userRes.ok) {
            const user = await userRes.json();
            return res.json({
                saldo: user.saldo,
                transacciones: user.transacciones,
                error: null
            });
        } else {
            return res.json({ error: "No se pudo obtener los datos actualizados" });
        }
    } else {

        let errorMsg = "Error en la transacción";
        try {
            const err = await response.json();
            if (err && err.error) errorMsg = err.error;
        } catch { }
        return res.json({ error: errorMsg });
    }
});

app.get("/dni", (req, res) => {
    const { dni } = req.query;
    res.json({ nombre: "Gabriel Alfonso", apellido: "Castillejo Mendez" })
})



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});


