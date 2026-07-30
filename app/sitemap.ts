import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: "https://freerent.money",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://freerent.money/llms.txt",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
