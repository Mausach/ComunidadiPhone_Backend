//GET /api/cobranza/ventas?localidad=cordoba&estado=al dia
//GET /api/cobranza/ventas?dni=30123456
//GET /api/cobranza/ventas?nombre=juan&pagina=1&limite=10
//GET /api/cobranza/ventas?fechaDesde=2026-07-01&fechaHasta=2026-07-31

//GET /api/cobranza/ventas/60d5f9b5c2a1b2a1b2a1b2a1

const express = require('express');
const { check } = require('express-validator');


const { listarVentasCobranza, detalleVentaCobranza, cobrarCuotas, editarFechaCuota, editarMontoCuota, cambiarEstadoCuota, agregarNotaCuota, listarCobranzasDelDia, editarRecargoCuota, agregarRecargoACuota } = require('../controlador/cobranza');
const { validarJWTCobranza } = require('../midelwaresdefin/ValidarJWT_cobranza');

const routerCob = express.Router();

routerCob.get('/ventas', validarJWTCobranza, listarVentasCobranza);
//routerCob.get('/cobranzas-hoy', listarCobranzasDelDia);
routerCob.get('/ventas/:id',validarJWTCobranza ,detalleVentaCobranza);
routerCob.post('/cobrar-cuotas',validarJWTCobranza, cobrarCuotas);

// En cobranzaRoutes.js
routerCob.put('/cuotas/:idVenta/:numeroCuota/fecha',validarJWTCobranza ,editarFechaCuota);
routerCob.put('/cuotas/:idVenta/:numeroCuota/monto',validarJWTCobranza ,editarMontoCuota);
// ==========================================
// RUTA PARA EDITAR RECARGO DE UNA CUOTA
// ==========================================
//routerCob.put('/cuotas/:idVenta/:numeroCuota/recargo', validarJWTCobranza, editarRecargoCuota);
// Agregar recargo manual a una cuota
routerCob.post('/cuotas/:idVenta/:numeroCuota/recargo', validarJWTCobranza, agregarRecargoACuota);
routerCob.put('/cuotas/:idVenta/:numeroCuota/estado',validarJWTCobranza, cambiarEstadoCuota);
routerCob.post('/cuotas/:idVenta/:numeroCuota/nota',validarJWTCobranza, agregarNotaCuota);


module.exports = routerCob;