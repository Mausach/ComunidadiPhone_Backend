// Rutes/EquipoCanje.js

const express = require('express');
const { listarEquiposCanje, obtenerEquipoCanjePorId, editarEquipoCanje, cambiarDisponibilidad } = require('../controlador/equiposcanje');


const routerEquipoCanje = express.Router();

// Listar equipos canje con filtros
//routerEquipoCanje.get('/', listarEquiposCanje);

// Obtener equipo canje por ID
routerEquipoCanje.get('/equipcanje/:id', obtenerEquipoCanjePorId);

// Editar equipo canje
routerEquipoCanje.put('/edit-equipcanje/:id', editarEquipoCanje);

// Cambiar disponibilidad (activo/inactivo)
//routerEquipoCanje.patch('/:id/disponibilidad', cambiarDisponibilidad);

module.exports = routerEquipoCanje;