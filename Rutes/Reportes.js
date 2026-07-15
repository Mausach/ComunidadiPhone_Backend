const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../midelwares/validarCampos');
const { reporteCobranzaMensual, reporteCobranzaPorLocalidad, historialCuotasPorVenta, reporteEquiposCanjeados } = require('../controlador/reportes');


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
routerReporteCobranza.get('/cobranza-por-localidad',
    [
        check("mes", "El mes es obligatorio").not().isEmpty(),
        check("anio", "El año es obligatorio").not().isEmpty(),
        validarCampos
    ],
    reporteCobranzaPorLocalidad
);

// Reporte de equipos canjeados
routerReporteCobranza.get('/equipos-canjeados',
    reporteEquiposCanjeados
);

module.exports = routerReporteCobranza;