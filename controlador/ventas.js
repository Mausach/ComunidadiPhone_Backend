const Cliente = require("../modelos/Cliente");
const Equipos = require("../modelos/Equipos");
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

// ==========================================
// 📝 CREAR VENTA (Método Unificado)
// ==========================================
const crearVenta2 = async (req, res) => {
    try {
        const {
            tipoVenta,
            fechaRealizada,
            fechaEntrega,
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
            cuotaEntrega,
            equipoCanje,
            equipoSeleccionado,
            descuentos,
            notas
        } = req.body;

        // ==========================================
        // 🕐 NORMALIZAR FECHA A ARGENTINA (UTC-3)
        // ==========================================
        const fechaRealizadaARG = fechaRealizada
            ? new Date(fechaRealizada + 'T00:00:00-03:00')
            : new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        const fechaEntregaARG = fechaEntrega
            ? new Date(fechaEntrega + 'T00:00:00-03:00')
            : null;

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
        // VALIDAR EQUIPO SELECCIONADO
        // ==========================================
        let equipoSeleccionadoInfo = null;

        if (equipoSeleccionado && equipoSeleccionado._id) {
            equipoSeleccionadoInfo = await Equipos.findOne({
                _id: equipoSeleccionado._id,
                disponible: true
            });

            if (!equipoSeleccionadoInfo) {
                return res.status(400).json({
                    ok: false,
                    message: 'El equipo seleccionado ya no está disponible'
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
        // 🚫 VALIDAR IMEI DUPLICADO (solo si NO es plan_canje)
        // ==========================================
        if (producto.imei && tipoVenta !== 'plan_canje') {
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
        // VALIDAR IMEI DEL EQUIPO CANJE (solo si ya es canje activo)
        // ==========================================
        if (equipoCanje?.imei && tipoVenta === 'plan_canje') {
            const imeiCanjeExistente = await Equipos.findOne({
                imei: equipoCanje.imei,
                disponible: true,
                origen: 'canje'
            });

            if (imeiCanjeExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El equipo con IMEI ${equipoCanje.imei} ya está en stock como canje disponible.`
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

                montoTotal = equipoSeleccionadoInfo?.precioVenta || producto.valor;
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

                montoTotal = (montoCuota * cantidadCuotas) + (pagos.reduce((sum, p) => sum + p.monto, 0) || 0);
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
                    cuotasGeneradas[0].fechaCobrada = fechaRealizadaARG;
                    cuotasGeneradas[0].metodoPago = 'efectivo';
                    cuotasGeneradas[0].montoPagado = montoCuota;
                    cuotasGeneradas[0].fechaCobro = fechaRealizadaARG;
                    cuotasGeneradas[0].cobrador = { nombre: vendedor || req.usuario?.nombre || 'Sistema' };
                }

                const cuotaEntregaNumero = parseInt(cuotaEntrega) || cantidadCuotas;

                if (cuotaEntregaNumero < 1 || cuotaEntregaNumero > cantidadCuotas) {
                    return res.status(400).json({
                        ok: false,
                        message: `La cuota de entrega debe estar entre 1 y ${cantidadCuotas}`
                    });
                }

                if (cuotasGeneradas[cuotaEntregaNumero - 1]) {
                    cuotasGeneradas[cuotaEntregaNumero - 1].notas = [
                        {
                            texto: `[ENTREGA] Equipo se entrega en esta cuota (Cuota ${cuotaEntregaNumero})`,
                            fecha: fechaRealizadaARG,
                            usuario: { nombre: vendedor || req.usuario?.nombre || 'Sistema' }
                        }
                    ];
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

                montoTotal = equipoSeleccionadoInfo?.precioVenta || producto.valor;
                frecuenciaCuota = null;
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
        // PROCESAR DESCUENTOS
        // ==========================================
        const descuentosProcesados = descuentos && Array.isArray(descuentos)
            ? descuentos
                .filter(d => d.monto > 0)
                .map(d => ({
                    monto: d.monto,
                    descripcion: d.descripcion?.trim() || 'Descuento sin descripción',
                    fecha: d.fecha ? new Date(d.fecha) : fechaRealizadaARG,
                    usuario: {
                        nombre: d.usuario?.nombre || req.usuario?.nombre || vendedor || 'Sistema'
                    }
                }))
            : [];

        const totalDescuentos = descuentosProcesados.reduce((sum, d) => sum + d.monto, 0);
        const montoTotalFinal = montoTotal - totalDescuentos;

        // ==========================================
        // CONSTRUIR DATOS DEL PRODUCTO
        // ==========================================
        const datosProducto = equipoSeleccionadoInfo ? {
            nombre: equipoSeleccionadoInfo.nombre,
            modelo: equipoSeleccionadoInfo.modelo || '',
            capacidad: equipoSeleccionadoInfo.capacidad || '',
            bateria: equipoSeleccionadoInfo.bateria || '',
            color: equipoSeleccionadoInfo.color || '',
            ...(equipoSeleccionadoInfo.imei && { imei: equipoSeleccionadoInfo.imei }),
            estado: equipoSeleccionadoInfo.estado || 'sellado',
            valor: equipoSeleccionadoInfo.precioVenta || producto.valor
        } : {
            nombre: producto.nombre,
            modelo: producto.modelo || '',
            capacidad: producto.capacidad || '',
            bateria: producto.bateria || '',
            color: producto.color || '',
            ...(producto.imei && { imei: producto.imei }),
            estado: producto.estado || 'sellado',
            valor: producto.valor
        };

        // ==========================================
        // CONSTRUIR OBJETO VENTA
        // ==========================================
        const datosVenta = {
            tipoVenta,
            fechaRealizada: fechaRealizadaARG,
            fechaEntrega: fechaEntregaARG,
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
                relacion: garante.relacion || '',      // 👈 NUEVO
                ocupacion: garante.ocupacion || '',    // 👈 NUEVO
                ...(garante.telefono2 && { telefono2: garante.telefono2 }),
                ...(garante.email && { email: garante.email }),
                direccion: garante.direccion || ''
            } : {},
            pagos: pagos || [],
            descuentos: descuentosProcesados,
            cuotas: cuotasGeneradas,
            montoTotal: montoTotalFinal,
            montoPagado: montoPagadoInicial,
            notas: notas || [],
            conducta_pago: tipoVenta === 'contado' ? 'cancelado' : 'al dia',
            estado: true
        };

        const ventaGuardada = await Venta.create(datosVenta);

        // ==========================================
        // ACTUALIZAR EQUIPO SELECCIONADO (VENTA)
        // ==========================================
        if (equipoSeleccionadoInfo) {
            try {
                // 👉 Agregar nota de venta al equipo
                const notasActualizadas = [...(equipoSeleccionadoInfo.notas || [])];
                notasActualizadas.push({
                    texto: `[VENTA] Equipo vendido en venta #${ventaGuardada._id} - Cliente: ${clienteDB.nombre} ${clienteDB.apellido} (DNI: ${clienteDB.dni})`,
                    fecha: fechaRealizadaARG,
                    usuario: {
                        nombre: vendedor || req.usuario?.nombre || 'Sistema'
                    },
                    tipo: 'importante'
                });

                await Equipos.findByIdAndUpdate(
                    equipoSeleccionadoInfo._id,
                    {
                        disponible: false,
                        fechaVenta: fechaRealizadaARG,
                        ventaAsociada: ventaGuardada._id,
                        notas: notasActualizadas
                    }
                );
            } catch (errorUpdateEquipo) {
                await Venta.findByIdAndDelete(ventaGuardada._id);
                console.error('Error al actualizar equipo, venta eliminada:', errorUpdateEquipo);

                return res.status(500).json({
                    ok: false,
                    message: 'No se pudo actualizar el equipo seleccionado. Venta cancelada.'
                });
            }
        }

        // ==========================================
        // GUARDAR/REUTILIZAR EQUIPO CANJE SI APLICA
        // ==========================================
        if (tipoVenta === 'plan_canje' && equipoCanje) {
            // ==========================================
            // 👉 VERIFICAR SI EL EQUIPO YA EXISTE POR IMEI
            // ==========================================
            let equipoExistente = null;

            if (equipoCanje.imei) {
                equipoExistente = await Equipos.findOne({
                    imei: equipoCanje.imei
                });
            }

            if (equipoExistente) {
                // ==========================================
                // 👉 REUTILIZAR EQUIPO EXISTENTE (NO duplicar)
                // ==========================================
                console.log(`🔄 Reingresando equipo existente: ${equipoExistente.nombre} (IMEI: ${equipoExistente.imei})`);

                equipoExistente.origen = 'canje';
                equipoExistente.ventaOrigen = ventaGuardada._id;
                equipoExistente.nombre = equipoCanje.nombre || equipoExistente.nombre;
                equipoExistente.modelo = equipoCanje.modelo || equipoExistente.modelo || '';
                equipoExistente.capacidad = equipoCanje.capacidad || equipoExistente.capacidad || '';
                equipoExistente.color = equipoCanje.color || equipoExistente.color || '';
                equipoExistente.bateria = equipoCanje.bateria || equipoExistente.bateria || '';
                equipoExistente.estado = equipoCanje.estado || 'bueno';
                equipoExistente.valorTasado = equipoCanje.valorTasado;
                equipoExistente.localidad = localidad || equipoExistente.localidad || '';
                equipoExistente.precioCompra = 0;
                equipoExistente.precioVenta = 0;
                equipoExistente.proveedor = {};
                equipoExistente.fechaRecepcion = fechaRealizadaARG;
                equipoExistente.fechaVenta = null;
                equipoExistente.disponible = true;
                equipoExistente.ventaAsociada = null;

                // 👉 Agregar nota de reingreso
                equipoExistente.notas.push({
                    texto: `[REINGRESO POR CANJE] Equipo reingresado como canje en venta #${ventaGuardada._id}. Valor tasado: $${equipoCanje.valorTasado}. Cliente anterior: ${clienteDB.nombre} ${clienteDB.apellido}`,
                    fecha: new Date(),
                    usuario: {
                        nombre: vendedor || req.usuario?.nombre || 'Sistema'
                    },
                    tipo: 'importante'
                });

                await equipoExistente.save();
            } else {
                // ==========================================
                // 👉 CREAR NUEVO EQUIPO CANJE (no existía)
                // ==========================================
                console.log(`➕ Creando nuevo equipo canje: ${equipoCanje.nombre}`);

                const datosEquipoCanje = {
                    origen: 'canje',
                    ventaOrigen: ventaGuardada._id,
                    nombre: equipoCanje.nombre,
                    modelo: equipoCanje.modelo || '',
                    capacidad: equipoCanje.capacidad || '',
                    ...(equipoCanje.imei && { imei: equipoCanje.imei }),
                    color: equipoCanje.color || '',
                    bateria: equipoCanje.bateria || '',
                    estado: equipoCanje.estado || 'bueno',
                    valorTasado: equipoCanje.valorTasado,
                    localidad: localidad || '',
                    fechaIngreso: new Date(),
                    fechaRecepcion: fechaRealizadaARG,
                    disponible: true,
                    notas: [{
                        texto: `[INGRESO POR CANJE] Equipo ingresado como canje en venta #${ventaGuardada._id}. Valor tasado: $${equipoCanje.valorTasado}. Cliente: ${clienteDB.nombre} ${clienteDB.apellido}`,
                        fecha: new Date(),
                        usuario: {
                            nombre: vendedor || req.usuario?.nombre || 'Sistema'
                        },
                        tipo: 'importante'
                    }]
                };

                await Equipos.create(datosEquipoCanje);
            }
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

    crearVenta2,



};