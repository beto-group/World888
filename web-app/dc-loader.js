module.exports = function (source) {
  let contents = source;
  const requireRegex = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*await\s+dc\.require\([^"']*(["'][^"']+["'])\s*\);?/g;
  contents = contents.replace(requireRegex, (match, imports, pathString) => {
    const cleanPath = pathString.replace(/['"]/g, '').split('/').pop();
    return `import {${imports}} from './${cleanPath}';`;
  });
  contents = contents.replace(/const activeFile = dc\.resolvePath.*/g, 'const activeFile = "";\nconst folderPath = "";');
  contents = contents.replace(/const folderPath = activeFile.*/g, '');
  contents = contents.replace(/const\s+\{\s*([A-Za-z0-9_,\s]+)\s*\}\s*=\s*dc;/g, (match, imports) => {
    if (imports.includes('useState') || imports.includes('useEffect') || imports.includes('useRef') || imports.includes('useCallback') || imports.includes('useMemo')) {
      return `import { ${imports.replace(/preact/g, '').replace(/h,\s*/g, '').replace(/render,\s*/g, '').trim()} } from "react";`;
    }
    return match;
  });
  contents = contents.replace(/const\s+\{\s*h,\s*render\s*\}\s*=\s*dc\.preact;/g, '');
  contents = contents.replace(/\/\*\*\s*@jsx\s+h\s*\*\//g, '');
  contents = contents.replace(/<dc\.Icon\s+icon=(['"])(.*?)\1([^>]*)\/>/g, '<span className={`icon icon-$2`} $3></span>');
  contents = contents.replace(/^return\s+(\{[^}]+\});\s*$/gm, 'export $1;');
  return contents;
};
