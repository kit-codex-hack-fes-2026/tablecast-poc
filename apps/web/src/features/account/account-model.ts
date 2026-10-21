import { z } from "zod";
import { collectionSearchFields } from "../shell/collection-model";

export const accountSearchSchema = z.looseObject({
  ...collectionSearchFields("connections"),
  ...collectionSearchFields("passkeys"),
  ...collectionSearchFields("sessions"),
});
