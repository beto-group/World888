
```datacorejsx
const folderPath = dc.resolvePath("WORLD 888.md").replace(/\/[^/]+$/, "");
const { View } = await dc.require(folderPath + "/src/index.jsx");
return await View({ folderPath, dc });
```
