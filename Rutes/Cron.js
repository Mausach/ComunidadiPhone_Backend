// Rutes/Cron.js

const express = require('express');
const { actualizarCuotasVencidas, obtenerEstadoCuotas } = require('../controlador/tareasautomaticascron');


const routerCron = express.Router();

// ==========================================
// POST: Ejecutar actualización manual
// ==========================================
routerCron.post('/actualizar-cuotas', actualizarCuotasVencidas);

// ==========================================
// GET: Ver estado de cuotas vencidas (debug)
// ==========================================
routerCron.get('/estado-cuotas', obtenerEstadoCuotas);

module.exports = routerCron;