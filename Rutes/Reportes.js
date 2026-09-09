const express = require('express');
const { check } = require('express-validator');

const { reporteCobranzaMensual, historialCuotasPorVenta, reporteEquiposCanjeados,  listarVentasContado, listarEquiposDisponibles2, resumenGeneral, reporteVentasFinanciadas, reporteVentasDirectasCanje, listarClientes, reporteGastos, crearGasto } = require('../controlador/reportes');
const { validarCampos } = require('../midelwaresdefin/ValidarCampos');


const routerReporteCobranza = express.Router();

// Historial completo de cuotas por venta
routerReporteCobranza.get('/historial-cuotas',
    historialCuotasPorVenta
);


routerReporteCobranza.get('/cobranza-mensual',
    [
        check("mes", "El mes es obligatorio").not().isEmpty(),
        check("anio", "El año es obligatorio").not().isEmpty(),
        validarCampos
    ],
    reporteCobranzaMensual
);

// Reporte de cobranza agrupado por localidad


// Reporte de equipos canjeados FALTA MIDELWARE
routerReporteCobranza.get('/equipos-canjeados',
    reporteEquiposCanjeados
);

//esto se usara en ventas y ceo
// Listar equipos disponibles (stock + canje)
routerReporteCobranza.get('/equipos-disp', listarEquiposDisponibles2);

routerReporteCobranza.get('/ventas-contado', listarVentasContado);

//para dashboard de reportes
routerReporteCobranza.get('/resumen-general', resumenGeneral);

//para dashboard de reportes de contado y canjes
routerReporteCobranza.get('/ventas-directas-canje', reporteVentasDirectasCanje);

//para dashboard de reportes de sistemas 1 y 2
routerReporteCobranza.get('/ventas-financiadas', reporteVentasFinanciadas);

//reportes clientes
routerReporteCobranza.get('/clientes', listarClientes);

//reportes clientes
routerReporteCobranza.get('/gastos',reporteGastos );

// 📥 Crear gasto
routerReporteCobranza.post('/new-gastos', crearGasto);

module.exports = routerReporteCobranza;