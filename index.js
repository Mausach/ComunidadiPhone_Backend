const express = require('express');
require('dotenv').config();
const cors = require("cors");
const { dbConeccion } = require('./dataBase/db_config');
const app = express();

// ==========================================
// 🕐 CRON JOB - Actualización diaria de cuotas
// ==========================================
const cron = require('node-cron');
const { actualizarCuotasVencidas } = require('./controlador/tareasautomaticascron');

cron.schedule('5 0 * * *', async () => {
    console.log('🚀 [CRON] Ejecutando control automático de cuotas...');
    console.log(`⏰ [CRON] Hora de ejecución: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);

    try {
        const req = {};
        const res = {
            status: (code) => ({
                json: (data) => console.log(`✅ [CRON] Resultado (${code}):`, JSON.stringify(data, null, 2))
            })
        };

        await actualizarCuotasVencidas(req, res);
    } catch (error) {
        console.error('❌ [CRON] Error general:', error.message);
    }
}, {
    scheduled: true,
    timezone: "America/Argentina/Buenos_Aires"
});

console.log('⏰ [CRON] Programado para las 00:05 (hora Argentina)');


// ==========================================
// 🔄 KEEP ALIVE - Anti-sueño (Horario: 09:00 - 00:15 Argentina)
// ==========================================
const URL_BACKEND = process.env.URL_BACKEND;

if (URL_BACKEND) {
    const protocolo = URL_BACKEND.includes('https') ? require('https') : require('http');

    setInterval(() => {
        const ahora = new Date().toLocaleString('en-US', { 
            timeZone: 'America/Argentina/Buenos_Aires',
            hour12: false 
        });
        
        const fecha = new Date(ahora);
        const hora = fecha.getHours();
        const minutos = fecha.getMinutes();
        const minutosActuales = (hora * 60) + minutos;
        
        const INICIO = 9 * 60;  // 09:00
        const FIN = 0 * 60 + 15;  // 00:15
        
        let enHorario = false;
        if (INICIO < FIN) {
            enHorario = minutosActuales >= INICIO && minutosActuales < FIN;
        } else {
            enHorario = minutosActuales >= INICIO || minutosActuales < FIN;
        }
        
        if (enHorario) {
            protocolo.get(`${URL_BACKEND}/api/health`, (res) => {
                console.log(`🔄 [KEEP-ALIVE] Ping: ${res.statusCode} - ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
            }).on('error', (err) => {
                console.error('❌ [KEEP-ALIVE] Error en ping:', err.message);
            });
        } else {
            const horaFormateada = `${hora}:${minutos.toString().padStart(2, '0')}`;
            console.log(`💤 [KEEP-ALIVE] Fuera de horario (${horaFormateada}). No se hace ping.`);
        }
    }, 10 * 60 * 1000); // Cada 10 minutos

    console.log('✅ [KEEP-ALIVE] Sistema anti-sueño iniciado (09:00 - 00:15 Argentina)');
} else {
    console.log('⚠️ [KEEP-ALIVE] URL_BACKEND no configurada. El sistema anti-sueño NO se inició.');
}


// ==========================================
// 🚀 CONFIGURACIÓN DEL SERVIDOR Y MIDDLEWARES
// ==========================================
app.listen(process.env.PORT, () => {
    console.log(`Server corriendo en el puerto ${process.env.PORT}`);
});

dbConeccion();

// Middlewares globales
app.use(cors());
app.use(express.static('public'));
app.use(express.json());


// ==========================================
// 🛣️ RUTAS DE LA API
// ==========================================
app.use("/auth", require('./Rutes/Auth'));
app.use("/admin", require('./Rutes/Admin'));
app.use("/vtas", require('./Rutes/Ventas'));
app.use("/cobranza", require('./Rutes/Cobranza'));
app.use("/rep_ceo", require('./Rutes/Reportes'));
app.use("/inv", require('./Rutes/Stock'));
app.use("/inve", require('./Rutes/Stockunico'));
app.use("/canje", require('./Rutes/Canjes'));
app.use("/api/cron", require('./Rutes/Cron'));
app.use("/documentos", require('./Rutes/Doc'));


// ==========================================
// 🤖 MCP SERVER (Herramientas para Claude)
// ==========================================
const { montarMCP } = require('./mcpServer');

// 👇 Como montarMCP es async (por el await import de getmcpauth), lo ejecutamos así:
(async () => {
    await montarMCP(app);
})();


// ==========================================
// ❤️ ENDPOINT DE SALUD (Para el Keep-Alive)
// ==========================================
app.get('/api/health', (req, res) => {
    res.status(200).json({
        ok: true,
        message: 'Servidor activo',
        timestamp: new Date()
    });
});