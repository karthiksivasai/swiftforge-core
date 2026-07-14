import { z } from "zod";

import { reqText } from "./_shared";

export const instructionCreateSchema = z.object({
  code: reqText("Instruction Code", 20),
  name: reqText("Instruction Name", 150),
});

export const instructionUpdateSchema = instructionCreateSchema.partial();

export type InstructionCreate = z.infer<typeof instructionCreateSchema>;
export type InstructionUpdate = z.infer<typeof instructionUpdateSchema>;

export const instructionDefaults: Partial<z.input<typeof instructionCreateSchema>> = {
  code: "",
  name: "",
};
