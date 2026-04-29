// server.js
const express = require('express');
const http = require('http'); // <-- Esta es la línea que falta
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const { Pool } = require('pg');
const cors = require('cors');
const {
    calculateBasicStats,
    calculateFullValidation,
} = require('./stats');

const app = express();

// Lista de orígenes permitidos: en producción, define FRONTEND_URL en Render
// (puedes pasar varias URLs separadas por coma si lo necesitas)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(s => s.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// 1. Crear el servidor HTTP y envolverlo con Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"] }
});
// Configuración dinámica: Si existe DATABASE_URL (Producción), úsala. 
// Si no, usa las variables individuales (Desarrollo local con Docker).
const pool = new Pool(
    process.env.DATABASE_URL 
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Requerido por Render para conexiones seguras
      }
    : {
        user: process.env.POSTGRES_USER,
        host: process.env.DB_HOST,
        database: process.env.POSTGRES_DB,
        password: process.env.POSTGRES_PASSWORD,
        port: process.env.DB_PORT,
      }
);

// 2. Conectar al Broker MQTT (ej. un contenedor Mosquitto local o en la nube)
// Nota: Necesitarás un Broker MQTT corriendo.
// Opciones de conexión MQTT (HiveMQ requiere usuario y contraseña)
const mqttOptions = {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    // Importante: HiveMQ Cloud exige un ClientId único o a veces rechaza conexiones
    clientId: 'soil-backend-' + Math.random().toString(16).substr(2, 8)
};

// Conectar usando la URL de las variables de entorno (o por defecto el mosquitto local)
// Nota: HiveMQ usa 'mqtts://' (seguro) en el puerto 8883
const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883';
const mqttClient = mqtt.connect(brokerUrl, mqttOptions);

mqttClient.on('connect', () => {
    console.log(`Backend conectado al Broker MQTT en: ${brokerUrl}`);
    // Suscribirse al tópico exacto de la sonda
    mqttClient.subscribe('finca/sondas/suelo/recepcion');
});

// ... (El resto de tu código mqttClient.on('message', ...) se queda exactamente igual)


// 3. Escuchar los mensajes MQTT entrantes
mqttClient.on('message', async (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());

        const avg = (arr) => arr && arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;

        const condicion = payload.condicion || null;

        const result = await pool.query(
            `INSERT INTO sensor_readings
             (sensor_id, temperature, humidity, ph, ec, n, p, k, test_condition)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
                payload.id,
                avg(payload.temperatura),
                avg(payload.humedad),
                avg(payload.ph),
                avg(payload.ec),
                avg(payload.n),
                avg(payload.p),
                avg(payload.k),
                condicion,
            ]
        );

        const newReading = result.rows[0];
        io.emit('new_sensor_data', newReading);

        console.log(`Dato guardado. Sensor: ${payload.id} | Fase: ${condicion} | Temp: ${avg(payload.temperatura)}`);

    } catch (error) {
        console.error('Error procesando mensaje MQTT:', error);
    }
});

// GET: Obtener todas las lecturas (con opción a filtrar por fechas)
app.get('/api/readings', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, s.name, s.type 
            FROM sensor_readings r
            JOIN sensors s ON r.sensor_id = s.id
            ORDER BY r.timestamp DESC LIMIT 1000
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Estadísticas descriptivas simples por sensor (legacy)
app.get('/api/stats/compare', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT temperature, humidity, sensor_id FROM sensor_readings');
        const commercialTemp = rows.filter(r => r.sensor_id === 1).map(r => Number(r.temperature));
        const customTemp = rows.filter(r => r.sensor_id === 2).map(r => Number(r.temperature));

        res.json({
            commercial: { temperature: calculateBasicStats(commercialTemp) },
            custom: { temperature: calculateBasicStats(customTemp) }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Validación por fases experimentales (t-test, boxplot, Pearson, RMSE)
//   ?from=ISO   → fecha inicio (opcional)
//   ?to=ISO     → fecha fin   (opcional)
app.get('/api/stats/validation', async (req, res) => {
    try {
        let query = `
            SELECT r.sensor_id, r.timestamp,
                   r.temperature, r.humidity, r.ph, r.ec, r.n, r.p, r.k,
                   r.test_condition, s.type
            FROM sensor_readings r
            JOIN sensors s ON r.sensor_id = s.id
            WHERE r.test_condition IS NOT NULL
        `;
        const params = [];

        if (req.query.from) {
            params.push(req.query.from);
            query += ` AND r.timestamp >= $${params.length}`;
        }
        if (req.query.to) {
            params.push(req.query.to);
            query += ` AND r.timestamp <= $${params.length}`;
        }

        query += ' ORDER BY r.timestamp ASC';

        const { rows } = await pool.query(query, params);
        res.json(calculateFullValidation(rows));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Insertar nueva lectura (con fase experimental opcional)
app.post('/api/readings', async (req, res) => {
    const { sensor_id, temperature, humidity, ph, ec, n, p, k, test_condition } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO sensor_readings
             (sensor_id, temperature, humidity, ph, ec, n, p, k, test_condition)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [sensor_id, temperature, humidity, ph, ec || null, n || null, p || null, k || null, test_condition || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT & DELETE omitidos por brevedad, seguirían el mismo patrón usando pool.query(...)

const PORT = process.env.PORT || 3001;
// ¡CRÍTICO! Usar 'server.listen' y NO 'app.listen' para que funcionen los WebSockets
server.listen(PORT, () => console.log(`Backend y WebSockets corriendo en puerto ${PORT}`));
