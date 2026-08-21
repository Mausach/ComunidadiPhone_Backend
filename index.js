const express = require('express');
require('dotenv').config()
const cors = require("cors");
const { dbConeccion } = require('./dataBase/db_config');
const app = express();

//llamar al servidor
app.listen(process.env.PORT, () => {
    console.log(`server corriendo en ${process.env.PORT}`)
})

//base de datos
dbConeccion();

// ==========================================
// 🕐 CRON JOB - Actualización diaria de cuotas
// ==========================================
const cron = require('node-cron');
const { actualizarCuotasVencidas } = require('./controlador/tareasautomaticascron');

// 🧪 MODO TEST: 23:25 hora Argentina
cron.schedule('5 0 * * *', async () => {
    console.log('🚀 [CRON] Ejecutando control automático de cuotas...');
    console.log(`⏰ [CRON] Hora de ejecución: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);

    try {
        // Crear un req/res simulado para llamar directamente a la función
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

console.log('🧪 [CRON] MODO TEST: Programado para las 23:25 (hora Argentina)');


// ==========================================
// 🔄 KEEP ALIVE - Horario: 09:00 - 00:15 Argentina
// ==========================================
const URL_BACKEND = process.env.URL_BACKEND;

if (URL_BACKEND) {
    const protocolo = URL_BACKEND.includes('https') ? require('https') : require('http');

    setInterval(() => {
        // Obtener hora actual de Argentina
        const ahora = new Date().toLocaleString('en-US', { 
            timeZone: 'America/Argentina/Buenos_Aires',
            hour12: false 
        });
        
        const fecha = new Date(ahora);
        const hora = fecha.getHours();
        const minutos = fecha.getMinutes();
        
        // Convertir a minutos totales del día
        const minutosActuales = (hora * 60) + minutos;
        
        // Rango: 09:00 (540 min) a 00:15 (15 min del día siguiente)
        const INICIO = 9 * 60;  // 540 = 09:00
        const FIN = 0 * 60 + 15;  // 15 = 00:15
        
        // Verificar si está en horario
        let enHorario = false;
        
        if (INICIO < FIN) {
            // Caso normal: 09:00 a 23:59
            enHorario = minutosActuales >= INICIO && minutosActuales < FIN;
        } else {
            // Caso especial: cruza medianoche (09:00 a 00:15)
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
    }, 10 * 60 * 1000);  // Cada 10 minutos

    console.log('✅ [KEEP-ALIVE] Sistema anti-sueño iniciado (09:00 - 00:15 Argentina)');
} else {
    console.log('⚠️ [KEEP-ALIVE] URL_BACKEND no configurada. El sistema anti-sueño NO se inició.');
}

// ==========================================
// ENDPOINT DE SALUD
// ==========================================
app.get('/api/health', (req, res) => {
    res.status(200).json({
        ok: true,
        message: 'Servidor activo',
        timestamp: new Date()
    });
});


//cors
app.use(cors());

//directorio publico
app.use(express.static('public'));

//lectura y parseo del body
app.use(express.json());

//midelwars son procesos que se van a correr durante la ejecucion
app.use("/auth", require('./Rutes/Auth'))

//para el admin
app.use("/admin", require('./Rutes/Admin'))

//para asesores y vendedores solamente cobranza
app.use("/vtas", require('./Rutes/Ventas'))

//para cobranza solamente 
app.use("/cobranza", require('./Rutes/Cobranza'))

//para los reportes del ceo
app.use("/rep_ceo", require('./Rutes/Reportes'))

//para los equiposde stock o inventario
app.use("/inv", require('./Rutes/Stock'))

//para los equiposde stock o inventario
app.use("/canje", require('./Rutes/Canjes'))

//para el cron de actualización automática
app.use("/api/cron", require('./Rutes/Cron'))