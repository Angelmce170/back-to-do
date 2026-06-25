import { Router } from "express";
import {register, login} from '../controllers/auth.controller.js';
import {auth} from '../middleware/auth.js';


const router = Router();

router.post('/register', register);//Registro de usuario
router.post('/login', login);//Login de usuario

export default router;