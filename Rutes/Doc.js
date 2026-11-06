const express = require('express');
const { contratoCreditoPersonal, solicitudFinanciacion } = require('../controlador/Doc');


const routerDocumentos = express.Router();

// 📄 Obtener datos para el PDF de Contrato
routerDocumentos.get('/contrato/:idVenta', contratoCreditoPersonal);

// 📄 Obtener datos para el PDF de Contrato
routerDocumentos.get('/soli-fin/:idVenta', solicitudFinanciacion);

module.exports = routerDocumentos;