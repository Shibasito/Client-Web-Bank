
# Despliegue del Cliente Web

El servicio del cliente web está desplegado y utiliza un virtual host de Azure.

Puedes acceder a la página desde:

[https://clientweb2020.servehttp.com/](https://clientweb2020.servehttp.com/)

---

# API & RabbitMQ Request Documentation

Este proyecto usa RabbitMQ para toda la comunicación entre servicios (Banco, RENIEC, Cliente Web). Aquí te dejo cómo son los cuerpos de las solicitudes y las rutas principales del cliente web.

## RabbitMQ Requests

### Banco (bank_queue)

- **Login**

 ```json
 {
  "operationType": "login",
  "payload": {
   "usuario": "string",
   "password": "string"
  }
 }
 ```

 Responde con:

 ```json
 {
  "status": "ok",
  "cuenta": { ... }
 }
 ```

- **Register**

 ```json
 {
  "operationType": "register",
  "payload": {
   "usuario": "string",
   "password": "string",
   "dni": "string",
   "saldo": 1000,
   "transacciones": []
  }
 }
 ```

- **Consultar usuario**

 ```json
 {
  "operationType": "consultar",
  "payload": {
   "userId": "string"
  }
 }
 ```

- **Transferencia**

 ```json
 {
  "operationType": "transaction",
  "payload": {
   "idOrigen": "string",
   "idDestino": "string (dni)",
   "monto": 100
  }
 }
 ```

- **Préstamo**

 ```json
 {
  "operationType": "prestamo",
  "payload": {
   "idUsuario": "string",
   "monto": 100
  }
 }
 ```

### RENIEC (reniec_queue)

- **Consulta de DNI**

 ```json
 {
  "dni": "string"
 }
 ```

 Responde con:

 ```json
 {
  "status": "ok",
  "persona": {
   "dni": "string",
   "nombres": "string",
   "apellidos": "string",
   ...
  }
 }
 ```

## Endpoints del Cliente Web

- `GET /login` — Renderiza el login.
- `POST /login` — Hace login usando RabbitMQ.
- `GET /register` — Renderiza el registro.
- `POST /register` — Registra usuario (usa banco y reniec por RabbitMQ).
- `GET /dni?dni=xxxxxxx` — Consulta DNI a RENIEC (por RabbitMQ).
- `POST /transfer` — Hace transferencia (RabbitMQ).
- `POST /prestamo` — Solicita préstamo (RabbitMQ).
- `GET /logout` — Cierra sesión.
- `GET /qr` — Devuelve QR de la cuenta.

---

Cualquier duda, revisa los archivos `index.js` de cada servicio. Todo lo que va por RabbitMQ tiene un `operationType` o un campo claro en el JSON. Si cambias algo en los cuerpos, actualiza este doc.
