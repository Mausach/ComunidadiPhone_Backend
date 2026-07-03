const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../midelwares/validarCampos');
const { validarJWTRolesSuperiores } = require('../Midelwares/ValidarJWT_Admin_Dev');
const { crearUsuario, actualizarUsuario, cargarUsuarios, CambiarEstadoUsuario } = require('../Controllers/Admin');




const routerAdmin = express.Router();

//RUTA PARA FUNCIONES SOBRE EL USUARIO EMPLEADO , PARA GERENTES CREADOR Y ADMIN.

//nuevo usuario
routerAdmin.post(
  '/new-user', validarJWTRolesSuperiores,
   [ //la ruta para crear un nuevo usuario empleado

  check("nombre", "El nombre es obligatorio").not().isEmpty().trim(),
  check("apellido", "El apellido es obligatorio").not().isEmpty().trim(),
  check("rol", "El rol es obligatorio").not().isEmpty(),
  check("email", "El email es obligatorio").not().isEmpty().isEmail().normalizeEmail(),
  check("telefono", "El teléfono es obligatorio").not().isEmpty().isMobilePhone(),
  check("localidad", "La localidad es obligatoria").not().isEmpty().trim(),

  // === Validaciones adicionales (opcionales) ===
  check("dni", "El DNI debe tener 8 dígitos").isLength({ min: 8, max: 8 }),
  validarCampos,

], crearUsuario
);


//editar datos del usuario
routerAdmin.put(
  '/update-user',
  validarJWTRolesSuperiores,
  [
  check("nombre", "El nombre es obligatorio").not().isEmpty().trim(),
  check("apellido", "El apellido es obligatorio").not().isEmpty().trim(),
  check("rol", "El rol es obligatorio").not().isEmpty(),
  check("email", "El email es obligatorio").not().isEmpty().isEmail().normalizeEmail(),
  check("telefono", "El teléfono es obligatorio").not().isEmpty().isMobilePhone(),
  check("localidad", "La localidad es obligatoria").not().isEmpty().trim(),

  // === Validaciones adicionales (opcionales) ===
  check("dni", "El DNI debe tener 8 dígitos").isLength({ min: 8, max: 8 }),
    validarCampos
  ],
  actualizarUsuario
);

//carga de todos los usuarios
routerAdmin.get('/usuarios', validarJWTRolesSuperiores, cargarUsuarios);

//cambia el estado del usuario
routerAdmin.put('/change-state', validarJWTRolesSuperiores, CambiarEstadoUsuario);


//aclaras que se exporta todo lo trabajado con router
module.exports = routerAdmin;