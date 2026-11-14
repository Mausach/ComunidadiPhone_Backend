const express = require('express');
const { check } = require('express-validator');


const { listarVentasCobranza, detalleVentaCobranza, cobrarCuotas, editarFechaCuota, editarMontoCuota, cambiarEstadoCuota, agregarNotaCuota, listarCobranzasDelDia, editarRecargoCuota, agregarRecargoACuota, editarRecargo, eliminarRecargo, getPanelCobranza, getCobrosRecibidos } = require('../controlador/cobranza');
//const { validarJWTCobranza } = require('../midelwaresdefin/ValidarJWT_cobranza');
const { validarJWTRolesGerencia } = require('../midelwaresdefin/validarJWTRolesGerencia');

const routerCob = express.Router();

routerCob.get('/ventas', validarJWTRolesGerencia, listarVentasCobranza);
//routerCob.get('/cobranzas-hoy', listarCobranzasDelDia);
routerCob.get('/ventas/:id',validarJWTRolesGerencia ,detalleVentaCobranza);
routerCob.post('/cobrar-cuotas',validarJWTRolesGerencia, cobrarCuotas);

// En cobranzaRoutes.js
routerCob.put('/cuotas/:idVenta/:numeroCuota/fecha',validarJWTRolesGerencia ,editarFechaCuota);
routerCob.put('/cuotas/:idVenta/:numeroCuota/monto',validarJWTRolesGerencia ,editarMontoCuota);
// ==========================================
// RUTA PARA EDITAR RECARGO DE UNA CUOTA
// ==========================================
//routerCob.put('/cuotas/:idVenta/:numeroCuota/recargo', validarJWTCobranza, editarRecargoCuota);
// Agregar recargo manual a una cuota
routerCob.post('/cuotas/:idVenta/:numeroCuota/recargo', validarJWTRolesGerencia, agregarRecargoACuota);
routerCob.put('/cuotas/:idVenta/:numeroCuota/estado',validarJWTRolesGerencia, cambiarEstadoCuota);
routerCob.post('/cuotas/:idVenta/:numeroCuota/nota',validarJWTRolesGerencia, agregarNotaCuota);

// ✏️ Editar recargo
routerCob.put('/:idVenta/:numeroCuota/recargo/:idRecargo',validarJWTRolesGerencia, editarRecargo);

// 🗑️ Eliminar recargo
routerCob.delete('/:idVenta/:numeroCuota/recargo/:idRecargo',validarJWTRolesGerencia, eliminarRecargo);

routerCob.get('/panel',validarJWTRolesGerencia, getPanelCobranza);




module.exports = routerCob;