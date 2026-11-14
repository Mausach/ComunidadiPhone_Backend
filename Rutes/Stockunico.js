// routes/EquipoRoutes.js

const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../midelwaresdefin/ValidarCampos');
const { listarEquipos, obtenerEquipoPorId, cargarEquipo, cargarEquipoCanje, editarEquipo, eliminarEquipo, obtenerEquipoCanjePorVenta } = require('../controlador/Stockunico');
const { validarJWTRolesGerencia } = require('../midelwaresdefin/validarJWTRolesGerencia');


const routerEquipo = express.Router();

// ==========================================
// RUTAS DE EQUIPOS (Stock + Canje)
// ==========================================

// 📋 Listar equipos (con filtros y paginación)
// Query params: origen, disponible, estado, nombre, modelo, capacidad, imei, localidad
routerEquipo.get('/equipos', validarJWTRolesGerencia, listarEquipos);

// 🔍 Obtener un equipo por ID
routerEquipo.get('/equipos/:id',validarJWTRolesGerencia, obtenerEquipoPorId);

// 📥 Cargar equipo al stock (origen: 'stock')
routerEquipo.post('/new-equipo',validarJWTRolesGerencia, cargarEquipo);

// 📥 Cargar equipo de canje (origen: 'canje')
routerEquipo.post('/new-canje', validarJWTRolesGerencia, cargarEquipoCanje);

// ✏️ Editar equipo
routerEquipo.put('/edit-equipo/:id',validarJWTRolesGerencia, editarEquipo);

// 🗑️ Eliminar equipo
routerEquipo.delete('/del-equipo/:id',validarJWTRolesGerencia, eliminarEquipo);

// 📤 Marcar como vendido (asociar a venta)
//routerEquipo.put('/:id/vender', marcarComoVendido);

// 📥 Reingresar al stock (desmarcar como vendido)
//routerEquipo.put('/:id/reingresar', reingresarEquipo);

// 🔍 Obtener un equipo por ID
routerEquipo.get('/equipos/por-venta/:id',validarJWTRolesGerencia, obtenerEquipoCanjePorVenta);

module.exports = routerEquipo;