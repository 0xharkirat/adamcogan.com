import type { Template } from "tinacms";

export const videoTemplate: Template = {
  name: "Video",
  label: "Video (self-hosted)",
  fields: [
    {
      name: "src",
      label: "Video file",
      type: "string",
      required: true,
      description: "Path to an mp4/mov under /media.",
    },
    {
      name: "caption",
      label: "Caption",
      type: "string",
    },
  ],
};
