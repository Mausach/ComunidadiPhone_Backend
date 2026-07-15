//GET /api/cobranza/ventas?localidad=cordoba&estado=al dia
//GET /api/cobranza/ventas?dni=30123456
//GET /api/cobranza/ventas?nombre=juan&pagina=1&limite=10
//GET /api/cobranza/ventas?fechaDesde=2026-07-01&fechaHasta=2026-07-31

//GET /api/cobranza/ventas/60d5f9b5c2a1b2a1b2a1b2a1

const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../midelwares/validarCampos');

const { listarVentasCobranza, detalleVentaCobranza, cobrarCuotas, editarFechaCuota, editarMontoCuota, cambiarEstadoCuota, agregarNotaCuota, listarCobranzasDelDia } = require('../Controllers/Cobranza');

const routerCob = express.Router();

routerCob.get('/ventas', listarVentasCobranza);
routerCob.get('/cobranzas-hoy', listarCobranzasDelDia);
routerCob.get('/ventas/:id', detalleVentaCobranza);
routerCob.post('/cobrar-cuotas', cobrarCuotas);

// En cobranzaRoutes.js
routerCob.put('/cuotas/:idVenta/:numeroCuota/fecha', editarFechaCuota);
routerCob.put('/cuotas/:idVenta/:numeroCuota/monto', editarMontoCuota);
routerCob.put('/cuotas/:idVenta/:numeroCuota/estado', cambiarEstadoCuota);
routerCob.post('/cuotas/:idVenta/:numeroCuota/nota', agregarNotaCuota);


module.exports = routerCob;