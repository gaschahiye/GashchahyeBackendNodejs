
// Figma Plugin Code - Run this in Figma Plugin Development
figma.showUI(__html__, { width: 500, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import-design') {
    try {
      const data = msg.data;
      
      // Clear existing nodes
      figma.currentPage.children.forEach(node => node.remove());
      
      // Import the design
      await importNode(data.document, figma.currentPage);
      
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
      figma.ui.postMessage({ type: 'success' });
      
    } catch (error) {
      figma.ui.postMessage({ type: 'error', message: error.message });
    }
  }
};

async function importNode(node, parent) {
  if (!node) return null;
  
  let figmaNode = null;
  
  switch (node.type) {
    case 'DOCUMENT':
    case 'CANVAS':
      // Process children directly
      if (node.children) {
        for (const child of node.children) {
          await importNode(child, parent);
        }
      }
      return null;
      
    case 'FRAME':
      figmaNode = figma.createFrame();
      figmaNode.name = node.name || 'Frame';
      if (node.absoluteBoundingBox) {
        figmaNode.resize(
          node.absoluteBoundingBox.width || 375,
          node.absoluteBoundingBox.height || 812
        );
        figmaNode.x = node.absoluteBoundingBox.x || 0;
        figmaNode.y = node.absoluteBoundingBox.y || 0;
      }
      break;
      
    case 'RECTANGLE':
      figmaNode = figma.createRectangle();
      figmaNode.name = node.name || 'Rectangle';
      if (node.absoluteBoundingBox) {
        figmaNode.resize(
          node.absoluteBoundingBox.width || 100,
          node.absoluteBoundingBox.height || 100
        );
      }
      break;
      
    case 'TEXT':
      figmaNode = figma.createText();
      figmaNode.name = node.name || 'Text';
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      if (node.characters) {
        figmaNode.characters = node.characters;
      }
      break;
      
    case 'ELLIPSE':
      figmaNode = figma.createEllipse();
      figmaNode.name = node.name || 'Ellipse';
      break;
      
    case 'VECTOR':
      figmaNode = figma.createRectangle(); // Fallback to rectangle
      figmaNode.name = node.name || 'Vector';
      break;
      
    default:
      figmaNode = figma.createFrame();
      figmaNode.name = node.name || node.type;
  }
  
  if (figmaNode) {
    // Apply basic properties
    if (node.opacity !== undefined) {
      figmaNode.opacity = node.opacity;
    }
    
    if (node.fills && figmaNode.fills !== figma.mixed) {
      try {
        figmaNode.fills = node.fills;
      } catch (e) {
        // Fills might not be compatible
      }
    }
    
    if (node.effects && figmaNode.effects !== figma.mixed) {
      try {
        figmaNode.effects = node.effects;
      } catch (e) {
        // Effects might not be compatible
      }
    }
    
    // Add to parent
    parent.appendChild(figmaNode);
    
    // Process children
    if (node.children) {
      for (const child of node.children) {
        await importNode(child, figmaNode);
      }
    }
  }
  
  return figmaNode;
}
