import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { list, create, update, remove, bulksync} from "../controllers/task.controller.js";

const router = Router();

router.use(auth);

router.get('/', list); // obtener todas las tareas
router.post('/', create); // crear una nueva tarea
router.put('/:id', update); // actualizar una tarea por ID
router.delete('/:id', remove); // eliminar una tarea por ID
router.post('/bulksync', bulksync); //sincronizar tareas en bloque (crear, actualizar, eliminar)

export default router;
