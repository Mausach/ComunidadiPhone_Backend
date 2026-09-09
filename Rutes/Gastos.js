const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../midelwaresdefin/ValidarCampos');
const { cargarGastos, crearGasto } = require('../controlador/gastos');


const routerGastos = express.Router();

// ==========================================
// RUTAS DE GASTOS
// ==========================================

// 📋 Listar gastos
routerGastos.get('/', cargarGastos);

// 📥 Crear gasto
routerGastos.post('/', [
    check('descripcion_gasto', 'La descripción es obligatoria').not().isEmpty(),
    check('Monto_gasto', 'El monto es obligatorio y debe ser mayor a 0').isNumeric(),
    check('responsable', 'El responsable es obligatorio').not().isEmpty(),
    validarCampos
], crearGasto);

module.exports = routerGastos;