// import { Injectable } from '@angular/core';
import { observable, computed, action, autorun, reaction } from 'mobx';
import { TreeModel } from './tree.model';
import { TreeNode } from './tree-node.model';
import { TREE_EVENTS } from '../constants/events';

const Y_OFFSET = 300; // Extra pixels outside the viewport, in each direction, to render nodes in
const Y_EPSILON = 50; // Minimum pixel change required to recalculate the rendered nodes

// @Injectable()
export class TreeVirtualScroll {
  @observable yBlocks = 0;
  @observable x = 0;
  @observable viewportHeight = null;
  viewport = null;

  private _dispose: any;
  
  @computed get y() {
    return this.yBlocks * Y_EPSILON;
  }

  @computed get totalHeight() {
    return this.treeModel.virtualRoot ? this.treeModel.virtualRoot.height : 0;
  }

  constructor(private treeModel: TreeModel) {
    treeModel.virtualScroll = this;
    this._dispose = [autorun(() => this.fixScroll())];
  }

  fireEvent(event: any) {
    this.treeModel.fireEvent(event);
  }

  init() {
    const fn = this.recalcPositions.bind(this);

    fn();
    this._dispose = [
      ...this._dispose,
      reaction(() => this.treeModel.roots, fn),
      reaction(() => this.treeModel.expandedNodeIds, fn),
      reaction(() => this.treeModel.hiddenNodeIds, fn)
    ];
    this.treeModel.subscribe(TREE_EVENTS.loadNodeChildren, fn);
  }

  isEnabled() {
    return this.treeModel.options.useVirtualScroll;
  }

  @action recalcPositions() {
    this.treeModel.virtualRoot.height = this._getPositionAfter(this.treeModel.getVisibleRoots(), 0);
  }

  @action private _setYBlocks(value: number) {
    this.yBlocks = value;
  }

  private _getPositionAfter(nodes: TreeNode[], startPos: number) {
    let position = startPos;

    nodes.forEach((node) => {
      node.position = position;
      position = this._getPositionAfterNode(node, position);
    });
    return position;
  }

  private _getPositionAfterNode(node, startPos) {
    let position = node.getSelfHeight() + startPos;

    if (node.children && node.isExpanded) { // TBD: consider loading component as well
      position = this._getPositionAfter(node.visibleChildren, position);
    }
    node.height = position - startPos;
    return position;
  }

  clear() {
    this._dispose.forEach((d) => d());
  }

  @action setViewport(viewport) {
    Object.assign(this, {
      viewport,
      x: viewport.scrollLeft,
      yBlocks: Math.round(viewport.scrollTop / Y_EPSILON),
      viewportHeight: viewport.getBoundingClientRect().height
    });
  }

  @action scrollIntoView(node, force, scrollToMiddle = true) {
    if (force || // force scroll to node
      node.position < this.y || // node is above viewport
      node.position + node.getSelfHeight() > this.y + this.viewportHeight) { // node is below viewport
      if (this.viewport) {
        this.viewport.scrollTop = scrollToMiddle ?
          node.position - this.viewportHeight / 2 : // scroll to middle
          node.position; // scroll to start

        this._setYBlocks(Math.floor(this.viewport.scrollTop / Y_EPSILON));
      }
    }
  }

  getViewportNodes(nodes) {
    if (!nodes) {
      return [];
    }

    const visibleNodes = nodes.filter((node) => !node.isHidden);

    if (!this.isEnabled()) {
      return visibleNodes;
    }

    if (!this.viewportHeight) {
      if (this.viewportHeight === 0) {
        console.warn(`
          The height of the virtual scroll in ReactTree is 0.
          If you are using virtual scroll you must supply a height to the container of the tree.
        `);
      }
      return [];
    }
    if (!visibleNodes.length) {
      return [];
    }

    // Search for first node in the viewport using binary search
    // Look for first node that starts after the beginning of the viewport (with buffer)
    // Or that ends after the beginning of the viewport
    const firstIndex = binarySearch(visibleNodes, (node) => {
      return (node.position + Y_OFFSET > this.y) ||
             (node.position + node.height > this.y);
    });

    // Search for last node in the viewport using binary search
    // Look for first node that starts after the end of the viewport (with buffer)
    const lastIndex = binarySearch(visibleNodes, (node) => {
      return node.position - Y_OFFSET > this.y + this.viewportHeight;
    },                             firstIndex);

    const viewportNodes = [];
    for (let i = firstIndex; i <= lastIndex; i++) {
      viewportNodes.push(visibleNodes[i]);
    }

    return viewportNodes;
  }

  fixScroll() {
    const maxY = Math.max(0, this.totalHeight - this.viewportHeight);

    if (this.y < 0) {
      this._setYBlocks(0);
    }
    if (this.y > maxY) {
      this._setYBlocks(maxY / Y_EPSILON);
    }
  }
}

function binarySearch(nodes, condition, firstIndex = 0) {
  let index = firstIndex;
  let toIndex = nodes.length - 1;

  while (index !== toIndex) {
    let midIndex = Math.floor((index + toIndex) / 2);

    if (condition(nodes[midIndex])) {
      toIndex = midIndex;
    } else {
      if (index === midIndex) {
        index = toIndex;
      } else {
        index = midIndex;
      }
    }
  }
  return index;
}
