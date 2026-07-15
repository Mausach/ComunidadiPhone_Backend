const express = require('express');

const { check } = require('express-validator');
const { loginUsuario, loginPrimerAcceso, configurarPasswordInicial } = require('../Controllers/auth');
const { verificarTokenSetup } = require('../midelwares/ValidarPrimerAcceso');
const { validarCampos } = require('../midelwares/validarCampos');

const routerAuth = express.Router();


//para logear usuario
routerAuth.post('/login',
    [
        check("email", "El email es obligatorio").not().isEmpty(),
        check("password", "La contraseña es obligatoria").not().isEmpty(),
        validarCampos
    ],
    loginUsuario
);

//para logear usuario primer acceso
routerAuth.post('/first-login',
    [
        check("email", "El email es obligatorio").not().isEmpty(),
        validarCampos
    ],
    loginPrimerAcceso
);

//para crear la contraseña
routerAuth.post('/setup-password', verificarTokenSetup,
    [
        check("password", "La contraseña es obligatoria").not().isEmpty(),
        validarCampos
    ],
    configurarPasswordInicial
);


module.exports = routerAuth;