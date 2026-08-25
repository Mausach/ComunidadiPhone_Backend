const express = require('express');
const { check } = require('express-validator');

const { reporteCobranzaMensual, historialCuotasPorVenta, reporteEquiposCanjeados, listarEquiposDisponibles, listarVentasContado } = require('../controlador/reportes');
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
routerReporteCobranza.get('/equipos-disp', listarEquiposDisponibles);

routerReporteCobranza.get('/ventas-contado', listarVentasContado);

module.exports = routerReporteCobranza;