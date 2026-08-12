// routes/stockRoutes.js
const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../midelwaresdefin/ValidarCampos');
const { listarStock, obtenerStockPorId, cargarStock, editarStock, eliminarStock } = require('../controlador/Stock');


const routerStock = express.Router();


// ==========================================
// RUTAS DE STOCK
// ==========================================

// 📋 Listar stock (con filtros y paginación)
routerStock.get('/stock',  listarStock);

// 🔍 Obtener un equipo por ID
routerStock.get('/stock/:id', obtenerStockPorId);

// 📥 Cargar equipo al stock
routerStock.post('/new-equipo', cargarStock);

// ✏️ Editar equipo en stock
routerStock.put('/edit-equipo/:id', editarStock);

// 🗑️ Eliminar equipo del stock
routerStock.delete('/del-equipo/:id', eliminarStock);

// 📤 Marcar como vendido (asociar a venta)
//router.put('/:id/vender', validarJWT, marcarComoVendido);

// 📥 Reingresar al stock (desmarcar como vendido)
//router.put('/:id/reingresar', validarJWT, reingresarAlStock);

module.exports = routerStock;