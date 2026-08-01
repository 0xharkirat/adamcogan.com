import type { Template } from "tinacms";

export const figureTemplate: Template = {
  name: "Figure",
  label: "Figure (captioned image)",
  fields: [
    {
      name: "src",
      label: "Image",
      type: "image",
      required: true,
    },
    {
      name: "alt",
      label: "Alt text",
      type: "string",
      description: "Describes the image for screen readers and when it fails to load.",
    },
    {
      name: "caption",
      label: "Caption",
      type: "string",
      description: 'Shown under the image. House style is "Figure: ...".',
    },
  ],
};
