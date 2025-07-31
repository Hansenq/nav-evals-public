module.exports = {
  printWidth: 90,
  trailingComma: "all",
  importOrder: ["^([./]|[../]|src/|~/)"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  plugins: ["@trivago/prettier-plugin-sort-imports"],
};
