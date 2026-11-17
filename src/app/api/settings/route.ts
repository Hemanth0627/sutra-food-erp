import { settingsSchema } from "@/lib/validation";
import { apiRoute } from "@/server/api";
import { updateSettings } from "@/server/services/stock";

export const PUT = apiRoute({ permission: "settings:manage", schema: settingsSchema }, async ({ actor, body }) => ({
  settings: { id: (await updateSettings(actor, body)).id },
}));
