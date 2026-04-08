import { Request, Response, NextFunction } from "express";
import { validateTicketsService } from "../services/tickets.service";

export const validateTickets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { tierId, quantity, purchaserRole } = req.body;

    const data = await validateTicketsService(
      tierId,
      quantity,
      purchaserRole
    );

    res.status(200).json({
      status: "success",
      data
    });

  } catch (error) {
    next(error);
  }
};