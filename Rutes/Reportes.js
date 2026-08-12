const express = require('express');
const { check } = require('express-validator');

const { reporteCobranzaMensual, historialCuotasPorVenta, reporteEquiposCanjeados } = require('../controlador/reportes');
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

module.exports = routerReporteCobranza;