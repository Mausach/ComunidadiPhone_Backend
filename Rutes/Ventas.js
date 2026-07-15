const express = require('express');
const { check } = require('express-validator');
const { validarJWTVentas } = require('../Midelwares/ValidarJWT_ventas');
const { validarCampos } = require('../midelwares/validarCampos');
const { crearCliente, crearVenta, buscarClientePorDni } = require('../Controllers/Ventas');

const routerVentas = express.Router();



//crear cliente 2
routerVentas.post('/new-clientes',
  validarJWTVentas,

    [
      check('dni', 'El DNI es obligatorio y debe tener 8 caracteres').isLength({ min: 8, max: 8 }).isNumeric(),
  
      validarCampos, // Middleware para validar los campos de entrada
    ], crearCliente
);

//bhuscar cliente por dni
routerVentas.get('/buscar-cliente/:dni', validarJWTVentas, buscarClientePorDni);


//para actualizar toda la venta
//routerVentas.put('/update-vta/:id', actualizarVenta);
  //procesar venta 2
routerVentas.post('/ventas-procesar',
     validarJWTVentas,
      crearVenta);






module.exports = routerVentas;