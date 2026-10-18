import { Router, type IRouter } from "express";
import healthRouter from "./health";
import legendsRouter from "./legends";

const router: IRouter = Router();

router.use(healthRouter);
router.use(legendsRouter);

export default router;
