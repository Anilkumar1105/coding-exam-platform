# Dynamic topic filter update

The Code Visualizations Lab topic dropdown is now generated from the actual `topic` values on loaded visualization records. It includes all distinct imported Excel/Firebase topics (case-insensitive deduplication), keeps an `All topics` option, sorts topic labels alphabetically, and rebuilds after published Firebase visualizations load. This avoids fixed filter categories that do not match imported rows.
