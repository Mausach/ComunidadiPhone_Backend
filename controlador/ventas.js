const Cliente = require("../modelos/Cliente");
const EquipoStock = require("../modelos/EquipoStock");
const EqupoCanjes = require("../modelos/EqupoCanjes");

const Venta = require("../modelos/Venta");


const crearCliente = async (req, res) => {
 const {
        nombre,
        apellido,
        dni,
        cuil,
        telefono,
        telefono2,  // 👉 NUEVO
        email,
        direccion,
        situacionCrediticia
    } = req.body;

    try {
        // ==========================================
        // VALIDAR CAMPOS OBLIGATORIOS
        // ==========================================
        if (!nombre || !apellido || !dni || !direccion) {
            return res.status(400).json({
                ok: false,
                message: 'Por favor, complete todos los campos obligatorios (nombre, apellido, dni, direccion).'
            });
        }

        // ==========================================
        // VALIDAR EMAIL (solo si viene)
        // ==========================================
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                ok: false,
                message: 'El formato del email no es válido.'
            });
        }

        // ==========================================
        // VALIDAR SITUACIÓN CREDITICIA (1-5)
        // ==========================================
        if (situacionCrediticia !== undefined && situacionCrediticia !== null && situacionCrediticia !== '') {
            const scoring = parseInt(situacionCrediticia, 10);
            if (isNaN(scoring) || scoring < 1 || scoring > 5) {
                return res.status(400).json({
                    ok: false,
                    message: 'La situación crediticia debe estar entre 1 y 5.'
                });
            }
        }

        // ==========================================
        // CONSTRUIR OBJETO CLIENTE (sin campos null)
        // ==========================================
        const datosCliente = {
            nombre,
            apellido,
            dni,
            direccion
        };

        // Solo agregar campos opcionales si tienen valor real
        if (cuil && cuil.trim() !== '') datosCliente.cuil = cuil.trim();
        if (telefono && telefono.trim() !== '') datosCliente.telefono = telefono.trim();
        // 👉 NUEVO: telefono2 opcional
        if (telefono2 && telefono2.trim() !== '') datosCliente.telefono2 = telefono2.trim();
        if (email && email.trim() !== '') datosCliente.email = email.trim().toLowerCase();
        if (situacionCrediticia !== undefined && situacionCrediticia !== null && situacionCrediticia !== '') {
            datosCliente.situacionCrediticia = parseInt(situacionCrediticia, 10);
        }

        // ==========================================
        // CREAR CLIENTE
        // ==========================================
        const nuevoCliente = new Cliente(datosCliente);
        await nuevoCliente.save();

        return res.status(201).json({
            ok: true,
            message: 'Cliente creado exitosamente',
            data: nuevoCliente
        });

    } catch (error) {
        console.error('Error al crear cliente:', error);

        // Error de clave duplicada (dni, cuil, email)
        if (error.code === 11000) {
            const campoDuplicado = Object.keys(error.keyValue)[0];
            const mensajes = {
                dni: 'Ya existe un cliente con ese DNI',
                cuil: 'Ya existe un cliente con ese CUIL',
                email: 'Ya existe un cliente con ese email'
            };
            return res.status(409).json({
                ok: false,
                message: mensajes[campoDuplicado] || `El campo ${campoDuplicado} ya existe.`
            });
        }

        // Error de validación de Mongoose
        if (error.name === 'ValidationError') {
            const mensajes = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                ok: false,
                message: mensajes.join('. ')
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al crear cliente: ${error.message}`
        });
    }
};


// En tu controlador de backend
const buscarClientePorDni = async (req, res) => {
    try {
        
        const { dni } = req.params;  

        if (!dni) {
            return res.status(400).json({
                ok: false,
                message: 'El DNI es obligatorio'
            });
        }

        const cliente = await Cliente.findOne({ 
            dni: dni.trim(),
            activo: true 
        });

        if (!cliente) {
            return res.status(404).json({
                ok: false,
                message: 'Cliente no encontrado'
            });
        }

        return res.status(200).json({
            ok: true,
            message: 'Cliente encontrado',
            data: cliente
        });

    } catch (error) {
        console.error('Error al buscar cliente:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al buscar cliente: ${error.message}`
        });
    }
};


const generarCuotas = ({ montoCuota, cantidadCuotas, fechaInicio, frecuencia }) => {
    const cuotas = [];
    let fechaActual = fechaInicio ? new Date(fechaInicio) : new Date();

    for (let i = 1; i <= cantidadCuotas; i++) {
        fechaActual = calcularProximaFecha(fechaActual, frecuencia, i);

        cuotas.push({
            numeroCuota: i,
            montoCuota: Number(montoCuota),
            metodoPago: null,
            fechaCobro: fechaActual,
            estado_cuota: 'pendiente',
            fechaCobrada: null,
            cobrador: {
                nombre: null
            },
            notas: []
        });
    }

    return cuotas;
};


const calcularProximaFecha = (fecha, frecuencia, numeroCuota) => {
    const nuevaFecha = new Date(fecha);

    switch (frecuencia) {
        case 'diario':
            nuevaFecha.setDate(nuevaFecha.getDate() + 1);
            break;

        case 'semanal':
            nuevaFecha.setDate(nuevaFecha.getDate() + 7);
            break;

        case 'quincenal':
            nuevaFecha.setDate(nuevaFecha.getDate() + 15);
            break;

        case 'mensual':
        default:
            nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
            nuevaFecha.setDate(10);
            break;
    }

    return nuevaFecha;
};


const crearVenta = async (req, res) => {
    try {
        const {
            tipoVenta,
            fechaRealizada,
            vendedor,
            localidad,
            cliente,
            producto,
            requiereGarante,
            garante,
            pagos,
            montoCuota,
            cantidadCuotas,
            frecuencia,
            equipoCanje,
            equipoSeleccionado,  // 👉 NUEVO: { _id, origen }
            notas
        } = req.body;

        // ==========================================
        // 🕐 NORMALIZAR FECHA A ARGENTINA (UTC-3)
        // ==========================================
        const fechaRealizadaARG = fechaRealizada
            ? new Date(fechaRealizada + 'T00:00:00-03:00')
            : new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        // ==========================================
        // VALIDACIONES BÁSICAS
        // ==========================================
        if (!tipoVenta || !cliente || !cliente.dni || !producto || !producto.nombre || !localidad) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan campos obligatorios (tipoVenta, cliente.dni, producto.nombre, localidad)'
            });
        }

        const tiposValidos = ['contado', 'sistema1', 'sistema2', 'plan_canje'];
        if (!tiposValidos.includes(tipoVenta)) {
            return res.status(400).json({
                ok: false,
                message: `Tipo de venta no válido. Debe ser: ${tiposValidos.join(', ')}`
            });
        }

        // ==========================================
        // 👉 VALIDAR EQUIPO SELECCIONADO (stock o canje)
        // ==========================================
        let equipoStockInfo = null;
        let equipoCanjeInfo = null;

        if (equipoSeleccionado && equipoSeleccionado._id) {
            if (equipoSeleccionado.origen === 'stock') {
                equipoStockInfo = await EquipoStock.findOne({
                    _id: equipoSeleccionado._id,
                    disponible: true
                });

                if (!equipoStockInfo) {
                    return res.status(400).json({
                        ok: false,
                        message: 'El equipo seleccionado ya no está disponible en stock'
                    });
                }
            } else if (equipoSeleccionado.origen === 'canje') {
                equipoCanjeInfo = await EqupoCanjes.findOne({
                    _id: equipoSeleccionado._id,
                    activo: true
                });

                if (!equipoCanjeInfo) {
                    return res.status(400).json({
                        ok: false,
                        message: 'El equipo canje seleccionado ya no está disponible'
                    });
                }
            } else {
                return res.status(400).json({
                    ok: false,
                    message: 'Origen de equipo no válido. Debe ser "stock" o "canje"'
                });
            }
        }

        // ==========================================
        // BUSCAR O CREAR CLIENTE
        // ==========================================
        let clienteDB = await Cliente.findOne({ dni: cliente.dni });

        if (!clienteDB) {
            clienteDB = await Cliente.create({
                nombre: cliente.nombre,
                apellido: cliente.apellido,
                dni: cliente.dni,
                ...(cliente.telefono && { telefono: cliente.telefono }),
                ...(cliente.telefono2 && { telefono2: cliente.telefono2 }),
                ...(cliente.email && { email: cliente.email }),
                direccion: cliente.direccion || ''
            });
        }

        // ==========================================
        // 🚫 VALIDAR CONDUCTA DE PAGO DEL CLIENTE
        // ==========================================
        const ventasActivasCliente = await Venta.find({
            'cliente.dni': cliente.dni,
            estado: true,
            conducta_pago: { $in: ['atrasado', 'cobro judicial', 'caducado'] }
        });

        if (ventasActivasCliente.length > 0) {
            return res.status(400).json({
                ok: false,
                message: `El cliente tiene ventas en estado "${ventasActivasCliente[0].conducta_pago}". No se puede realizar una nueva venta hasta regularizar su situación.`
            });
        }

        // ==========================================
        // 🚫 VALIDAR IMEI DUPLICADO (si viene)
        // ==========================================
        if (producto.imei) {
            const imeiExistente = await Venta.findOne({
                'producto.imei': producto.imei,
                estado: true
            });

            if (imeiExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${producto.imei} ya está registrado en otra venta activa.`
                });
            }
        }

        // ==========================================
        // VALIDACIONES POR TIPO DE VENTA
        // ==========================================
        let montoTotal = 0;
        let cuotasGeneradas = [];
        let frecuenciaCuota = null;

        switch (tipoVenta) {
            case 'contado':
                if (!pagos || pagos.length === 0) {
                    return res.status(400).json({
                        ok: false,
                        message: 'Venta al contado requiere al menos un pago'
                    });
                }

                for (const pago of pagos) {
                    if (!pago.monto || !pago.metodo) {
                        return res.status(400).json({
                            ok: false,
                            message: 'Cada pago debe tener monto y método'
                        });
                    }
                }

                montoTotal = producto.valor;
                frecuenciaCuota = null;
                break;

            case 'sistema1':
                if (!pagos || pagos.length === 0) {
                    return res.status(400).json({
                        ok: false,
                        message: 'Sistema 1 requiere entrega inicial (pagos)'
                    });
                }

                if (!montoCuota || !cantidadCuotas) {
                    return res.status(400).json({
                        ok: false,
                        message: 'Sistema 1 requiere montoCuota y cantidadCuotas'
                    });
                }

                cuotasGeneradas = generarCuotas({
                    montoCuota,
                    cantidadCuotas,
                    fechaInicio: fechaRealizadaARG,
                    frecuencia: frecuencia || 'mensual'
                });

                montoTotal = producto.valor;
                frecuenciaCuota = frecuencia || 'mensual';
                break;

            case 'sistema2':
                if (!montoCuota || !cantidadCuotas) {
                    return res.status(400).json({
                        ok: false,
                        message: 'Sistema 2 requiere montoCuota y cantidadCuotas'
                    });
                }

                cuotasGeneradas = generarCuotas({
                    montoCuota,
                    cantidadCuotas,
                    fechaInicio: fechaRealizadaARG,
                    frecuencia: frecuencia || 'mensual'
                });

                if (cuotasGeneradas.length > 0) {
                    cuotasGeneradas[0].estado_cuota = 'pagada';
                    cuotasGeneradas[0].fechaCobrada = new Date(new Date().toLocaleString('en-US', { 
                        timeZone: 'America/Argentina/Buenos_Aires' 
                    }));
                    cuotasGeneradas[0].metodoPago = 'efectivo';
                    cuotasGeneradas[0].montoPagado = montoCuota;
                    cuotasGeneradas[0].fechaCobro = fechaRealizadaARG;
                }

                montoTotal = montoCuota * cantidadCuotas;
                frecuenciaCuota = frecuencia || 'mensual';
                break;

            case 'plan_canje':
                if (!equipoCanje || !equipoCanje.valorTasado) {
                    return res.status(400).json({
                        ok: false,
                        message: 'Plan canje requiere datos del equipo recibido y su valor tasado'
                    });
                }

                if (equipoCanje.imei) {
                    const imeiCanjeExistente = await EqupoCanjes.findOne({
                        imei: equipoCanje.imei,
                        activo: true
                    });

                    if (imeiCanjeExistente) {
                        return res.status(400).json({
                            ok: false,
                            message: `El IMEI ${equipoCanje.imei} del equipo a canjear ya está registrado.`
                        });
                    }
                }

                if (montoCuota && cantidadCuotas) {
                    cuotasGeneradas = generarCuotas({
                        montoCuota,
                        cantidadCuotas,
                        fechaInicio: fechaRealizadaARG,
                        frecuencia: frecuencia || 'mensual'
                    });
                    montoTotal = (montoCuota * cantidadCuotas) + equipoCanje.valorTasado;
                    frecuenciaCuota = frecuencia || 'mensual';
                } else if (pagos && pagos.length > 0) {
                    montoTotal = producto.valor;
                    frecuenciaCuota = null;
                } else {
                    montoTotal = equipoCanje.valorTasado;
                    frecuenciaCuota = null;
                }
                break;
        }

        // ==========================================
        // CALCULAR MONTO PAGADO INICIAL
        // ==========================================
        let montoPagadoInicial = 0;
        if (pagos && pagos.length > 0) {
            montoPagadoInicial = pagos.reduce((total, pago) => total + pago.monto, 0);
        }

        if (tipoVenta === 'sistema2' && cuotasGeneradas.length > 0) {
            montoPagadoInicial += cuotasGeneradas[0].montoCuota;
        }

        // ==========================================
        // CONSTRUIR OBJETO VENTA
        // ==========================================
        // 👉 Si se seleccionó un equipo del stock, usar sus datos
        const datosProducto = equipoStockInfo ? {
            nombre: equipoStockInfo.nombre,
            modelo: equipoStockInfo.modelo || '',
            bateria: equipoStockInfo.bateria || '',
            color: equipoStockInfo.color || '',
            ...(equipoStockInfo.imei && { imei: equipoStockInfo.imei }),
            estado: equipoStockInfo.estado || 'sellado',
            valor: producto.valor  // El valor lo define el vendedor en el front
        } : {
            nombre: producto.nombre,
            modelo: producto.modelo || '',
            bateria: producto.bateria || '',
            color: producto.color || '',
            ...(producto.imei && { imei: producto.imei }),
            estado: producto.estado || 'sellado',
            valor: producto.valor
        };

        const datosVenta = {
            tipoVenta,
            fechaRealizada: fechaRealizadaARG,
            vendedor: vendedor || '',
            localidad,
            frecuenciaCuota,
            cliente: {
                nombre: clienteDB.nombre,
                apellido: clienteDB.apellido,
                dni: clienteDB.dni,
                telefono: clienteDB.telefono || '',
                ...(clienteDB.telefono2 && { telefono2: clienteDB.telefono2 }),
                email: clienteDB.email || '',
                direccion: clienteDB.direccion || ''
            },
            producto: datosProducto,
            requiereGarante: requiereGarante || false,
            garante: requiereGarante && garante ? {
                nombre: garante.nombre || '',
                apellido: garante.apellido || '',
                dni: garante.dni || '',
                ...(garante.cuil && { cuil: garante.cuil }),
                telefono: garante.telefono || '',
                ...(garante.telefono2 && { telefono2: garante.telefono2 }),
                ...(garante.email && { email: garante.email }),
                direccion: garante.direccion || ''
            } : {},
            pagos: pagos || [],
            cuotas: cuotasGeneradas,
            montoTotal,
            montoPagado: montoPagadoInicial,
            notas: notas || [],
            conducta_pago: tipoVenta === 'contado' ? 'cancelado' : 'al dia',
            estado: true
        };

        const ventaGuardada = await Venta.create(datosVenta);

        // ==========================================
        // 👉 ACTUALIZAR EQUIPO SELECCIONADO
        // ==========================================
        if (equipoSeleccionado && equipoSeleccionado._id) {
            try {
                if (equipoSeleccionado.origen === 'stock') {
                    await EquipoStock.findByIdAndUpdate(
                        equipoSeleccionado._id,
                        {
                            disponible: false,
                            fechaVenta: fechaRealizadaARG,
                            ventaAsociada: ventaGuardada._id
                        }
                    );
                } else if (equipoSeleccionado.origen === 'canje') {
                    await EqupoCanjes.findByIdAndUpdate(
                        equipoSeleccionado._id,
                        {
                            activo: false
                        }
                    );
                }
            } catch (errorUpdateEquipo) {
                // ⚠️ Rollback: eliminar la venta si falla la actualización del equipo
                await Venta.findByIdAndDelete(ventaGuardada._id);
                console.error('Error al actualizar equipo, venta eliminada:', errorUpdateEquipo);
                
                return res.status(500).json({
                    ok: false,
                    message: 'No se pudo actualizar el equipo seleccionado. Venta cancelada.'
                });
            }
        }

        // ==========================================
        // GUARDAR EQUIPO CANJE SI APLICA (cuando es plan canje)
        // ==========================================
        if (tipoVenta === 'plan_canje' && equipoCanje) {
            const datosEquipoCanje = {
                ventaOrigen: ventaGuardada._id,
                nombre: equipoCanje.nombre,
                modelo: equipoCanje.modelo || '',
                ...(equipoCanje.imei && { imei: equipoCanje.imei }),
                color: equipoCanje.color || '',
                bateria: equipoCanje.bateria || '',
                estado: equipoCanje.estado || 'bueno',
                valorTasado: equipoCanje.valorTasado,
                localidad: localidad || '',
                fechaRecepcion: fechaRealizadaARG
            };

            await EqupoCanjes.create(datosEquipoCanje);
        }

        return res.status(201).json({
            ok: true,
            message: 'Venta creada exitosamente',
            data: ventaGuardada
        });

    } catch (error) {
        console.error('Error al crear venta:', error);

        if (error.code === 11000) {
            const campo = Object.keys(error.keyValue)[0];
            const mensajes = {
                'producto.imei': 'Ya existe una venta con ese IMEI',
            };
            return res.status(409).json({
                ok: false,
                message: mensajes[campo] || `Ya existe un registro con ese ${campo}`
            });
        }

        if (error.name === 'ValidationError') {
            const mensajes = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                ok: false,
                message: mensajes.join('. ')
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al crear venta: ${error.message}`
        });
    }
};

module.exports = {
    crearCliente,
    buscarClientePorDni,
    crearVenta,

};