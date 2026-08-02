import type { Template } from "tinacms";

export const galleryTemplate: Template = {
  name: "Gallery",
  label: "Gallery (legacy)",
  fields: [
    { name: "columns", label: "Columns", type: "string" },
    {
      name: "items",
      label: "Items (JSON)",
      type: "string",
      ui: { component: "textarea" },
      description:
        "Legacy WordPress galleries only. Leave alone unless you know the JSON format.",
    },
  ],
};
