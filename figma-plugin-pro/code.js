
// Professional Figma Design Importer for ContractGuard AI
// Auto-generated from React/Tailwind design

figma.showUI(__html__, { width: 600, height: 700, themeColors: true });

// Design system storage
let colorStyles = new Map();
let textStyles = new Map();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import-design') {
    try {
      const data = msg.data;
      
      // Step 1: Create design system
      figma.ui.postMessage({ type: 'progress', step: 'Creating color styles...', progress: 10 });
      await createColorStyles(data.colorStyles);
      
      figma.ui.postMessage({ type: 'progress', step: 'Creating text styles...', progress: 20 });
      await createTextStyles(data.textStyles);
      
      // Step 2: Clear canvas
      figma.ui.postMessage({ type: 'progress', step: 'Preparing canvas...', progress: 30 });
      figma.currentPage.children.forEach(node => node.remove());
      
      // Step 3: Import structure
      figma.ui.postMessage({ type: 'progress', step: 'Importing screens...', progress: 40 });
      await importDocument(data.document);
      
      // Step 4: Apply auto-layout
      figma.ui.postMessage({ type: 'progress', step: 'Applying auto-layout...', progress: 70 });
      await applyAutoLayout(figma.currentPage);
      
      // Step 5: Organize layers
      figma.ui.postMessage({ type: 'progress', step: 'Organizing layers...', progress: 80 });
      organizeLayers(figma.currentPage);
      
      // Step 6: Final touches
      figma.ui.postMessage({ type: 'progress', step: 'Finalizing...', progress: 95 });
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
      
      figma.ui.postMessage({ type: 'success', progress: 100 });
      
    } catch (error) {
      console.error('Import error:', error);
      figma.ui.postMessage({ type: 'error', message: error.message });
    }
  }
};

async function createColorStyles(colorData) {
  if (!colorData) return;
  
  for (const [hex, data] of Object.entries(colorData)) {
    try {
      const style = figma.createPaintStyle();
      style.name = data.name;
      style.paints = [{
        type: 'SOLID',
        color: {
          r: data.rgb.r / 255,
          g: data.rgb.g / 255,
          b: data.rgb.b / 255
        },
        opacity: data.rgb.a
      }];
      colorStyles.set(hex, style);
    } catch (e) {
      console.warn('Could not create color style:', data.name);
    }
  }
}

async function createTextStyles(textData) {
  if (!textData) return;
  
  // Load default font
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  
  for (const [key, data] of Object.entries(textData)) {
    try {
      const style = figma.createTextStyle();
      style.name = data.name;
      style.fontSize = data.fontSize;
      style.fontName = { family: data.fontFamily, style: "Regular" };
      style.lineHeight = { value: data.lineHeight, unit: "PIXELS" };
      style.letterSpacing = { value: data.letterSpacing, unit: "PIXELS" };
      textStyles.set(key, style);
    } catch (e) {
      console.warn('Could not create text style:', data.name);
    }
  }
}

async function importDocument(documentData) {
  if (!documentData || !documentData.children) return;
  
  for (const canvas of documentData.children) {
    if (canvas.type === 'CANVAS') {
      for (const frameData of canvas.children) {
        await importFrame(frameData, figma.currentPage);
      }
    }
  }
}

async function importFrame(frameData, parent) {
  const frame = figma.createFrame();
  frame.name = frameData.name;
  frame.x = frameData.x || 0;
  frame.y = frameData.y || 0;
  frame.resize(frameData.width, frameData.height);
  
  // Apply background color
  if (frameData.backgroundColor) {
    frame.fills = [{
      type: 'SOLID',
      color: frameData.backgroundColor
    }];
  }
  
  // Apply corner radius
  if (frameData.cornerRadius !== undefined) {
    frame.cornerRadius = frameData.cornerRadius;
  }
  
  parent.appendChild(frame);
  
  // Import children
  if (frameData.children && frameData.children.length > 0) {
    for (const childData of frameData.children) {
      await importNode(childData, frame);
    }
  }
  
  return frame;
}

async function importNode(nodeData, parent) {
  let node = null;
  
  try {
    switch (nodeData.type) {
      case 'TEXT':
        node = figma.createText();
        node.name = nodeData.name || 'Text';
        node.x = nodeData.x || 0;
        node.y = nodeData.y || 0;
        
        if (nodeData.characters) {
          node.characters = nodeData.characters;
        }
        
        if (nodeData.style) {
          const fontFamily = nodeData.style.fontFamily || 'Inter';
          const fontWeight = nodeData.style.fontWeight || 400;
          const fontStyle = fontWeight >= 600 ? 'Bold' : fontWeight >= 500 ? 'Medium' : 'Regular';
          
          try {
            await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
            node.fontName = { family: fontFamily, style: fontStyle };
          } catch (e) {
            await figma.loadFontAsync({ family: "Inter", style: "Regular" });
            node.fontName = { family: "Inter", style: "Regular" };
          }
          
          if (nodeData.style.fontSize) node.fontSize = nodeData.style.fontSize;
          if (nodeData.style.textAlignHorizontal) node.textAlignHorizontal = nodeData.style.textAlignHorizontal;
        }
        
        if (nodeData.fills && nodeData.fills.length > 0) {
          node.fills = nodeData.fills;
        }
        break;
        
      case 'RECTANGLE':
        node = figma.createRectangle();
        node.name = nodeData.name || 'Rectangle';
        node.x = nodeData.x || 0;
        node.y = nodeData.y || 0;
        node.resize(nodeData.width || 100, nodeData.height || 100);
        
        if (nodeData.cornerRadius !== undefined) {
          node.cornerRadius = nodeData.cornerRadius;
        }
        
        if (nodeData.fills && nodeData.fills.length > 0) {
          node.fills = nodeData.fills;
        }
        
        if (nodeData.effects && nodeData.effects.length > 0) {
          node.effects = nodeData.effects;
        }
        break;
        
      default:
        node = figma.createFrame();
        node.name = nodeData.name || 'Element';
        node.x = nodeData.x || 0;
        node.y = nodeData.y || 0;
        node.resize(nodeData.width || 100, nodeData.height || 100);
    }
    
    if (node) {
      parent.appendChild(node);
    }
    
  } catch (error) {
    console.error('Error importing node:', nodeData.name, error);
  }
  
  return node;
}

async function applyAutoLayout(parent) {
  if (!parent || !parent.children) return;
  
  // Apply auto-layout to frames that have multiple children
  for (const node of parent.children) {
    if (node.type === 'FRAME' && node.children.length > 1) {
      try {
        // Check if children are arranged in a way that suggests vertical layout
        const children = node.children;
        let minY = Infinity, maxY = -Infinity;
        
        for (const child of children) {
          if (child.y < minY) minY = child.y;
          if (child.y + child.height > maxY) maxY = child.y + child.height;
        }
        
        const heightRange = maxY - minY;
        
        // If children span most of the frame height, apply vertical layout
        if (heightRange > node.height * 0.5) {
          node.layoutMode = 'VERTICAL';
          node.primaryAxisSizingMode = 'AUTO';
          node.counterAxisSizingMode = 'FIXED';
          node.itemSpacing = 16;
          node.paddingTop = 20;
          node.paddingBottom = 20;
          node.paddingLeft = 20;
          node.paddingRight = 20;
        }
      } catch (e) {
        // Auto-layout not applicable
      }
    }
  }
}

function organizeLayers(parent) {
  if (!parent || !parent.children) return;
  
  // Sort children by y position (top to bottom)
  const sorted = [...parent.children].sort((a, b) => a.y - b.y);
  
  // Reorder in Figma
  sorted.forEach((child, index) => {
    if (child.parent) {
      const currentIndex = child.parent.children.indexOf(child);
      if (currentIndex !== index) {
        child.parent.insertChild(index, child);
      }
    }
  });
  
  // Recurse
  for (const child of parent.children) {
    if (child.type === 'FRAME') {
      organizeLayers(child);
    }
  }
}
