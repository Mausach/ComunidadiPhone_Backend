const express = require('express');
const { check } = require('express-validator');

const { reporteCobranzaMensual, historialCuotasPorVenta, reporteEquiposCanjeados,  listarVentasContado, listarEquiposDisponibles2, resumenGeneral, reporteVentasFinanciadas, reporteVentasDirectasCanje, listarClientes, reporteGastos, crearGasto, reportesVentasCeo, agregarDocumentacion, actualizarDocumentacion, obtenerDocumentacion } = require('../controlador/reportes');
const { validarCampos } = require('../midelwaresdefin/ValidarCampos');
const { validarJWTRolesGerencia } = require('../midelwaresdefin/validarJWTRolesGerencia');


const routerReporteCobranza = express.Router();

// Historial completo de cuotas por venta
routerReporteCobranza.get('/historial-cuotas',validarJWTRolesGerencia,
    historialCuotasPorVenta
);


routerReporteCobranza.get('/cobranza-mensual',validarJWTRolesGerencia,
    [
        check("mes", "El mes es obligatorio").not().isEmpty(),
        check("anio", "El año es obligatorio").not().isEmpty(),
        validarCampos
    ],
    reporteCobranzaMensual
);

// Reporte de cobranza agrupado por localidad


// Reporte de equipos canjeados FALTA MIDELWARE
routerReporteCobranza.get('/equipos-canjeados',validarJWTRolesGerencia,
    reporteEquiposCanjeados
);

//esto se usara en ventas y ceo
// Listar equipos disponibles (stock + canje)
routerReporteCobranza.get('/equipos-disp',validarJWTRolesGerencia, listarEquiposDisponibles2);

routerReporteCobranza.get('/ventas-contado',validarJWTRolesGerencia, listarVentasContado);

//para dashboard de reportes
routerReporteCobranza.get('/resumen-general',validarJWTRolesGerencia, resumenGeneral);

//para dashboard de reportes de contado y canjes
routerReporteCobranza.get('/ventas-directas-canje',validarJWTRolesGerencia, reporteVentasDirectasCanje);

//para dashboard de reportes de sistemas 1 y 2
routerReporteCobranza.get('/ventas-financiadas',validarJWTRolesGerencia, reporteVentasFinanciadas);

//reportes clientes
routerReporteCobranza.get('/clientes',validarJWTRolesGerencia, listarClientes);

//reportes clientes
routerReporteCobranza.get('/gastos',validarJWTRolesGerencia,reporteGastos );

//reportes de todas las ventas CEO
routerReporteCobranza.get('/rep-vtas',validarJWTRolesGerencia,reportesVentasCeo );

// 📥 Crear gasto
routerReporteCobranza.post('/new-gastos',validarJWTRolesGerencia, crearGasto);



// 📤 Agregar documentación a una venta
routerReporteCobranza.post('/agregar-documentacion/:idVenta',validarJWTRolesGerencia, agregarDocumentacion);

// ✏️ Actualizar documentación de una venta
routerReporteCobranza.put('/actualizar-documentacion/:idVenta',validarJWTRolesGerencia, actualizarDocumentacion);

// 🔍 Obtener documentación de una venta
routerReporteCobranza.get('/documentacion/:idVenta',validarJWTRolesGerencia, obtenerDocumentacion);    



module.exports = routerReporteCobranza;