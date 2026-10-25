export type EditorMode='sculpt'|'translate'|'rotate'|'scale';
export type TransformSpace='world'|'local';
/** Explicit ownership prevents one gesture from also sculpting or orbiting. */
export class InputOwnership {
  suspended=false;
  mode:EditorMode='sculpt';
  space:TransformSpace='world';
  private owner:'none'|'sculpt'|'transform'|'preview'='none';
  get cameraEnabled():boolean {return !this.suspended&&this.owner==='none';}
  get transforming():boolean {return this.owner==='transform'||this.owner==='preview';}
  canSculpt(editable:boolean,busy=false):boolean {return !this.suspended&&this.mode==='sculpt'&&this.owner!=='transform'&&this.owner!=='preview'&&editable&&!busy;}
  beginSculpt(editable:boolean,busy=false):boolean {if(this.owner!=='none'||!this.canSculpt(editable,busy))return false;this.owner='sculpt';return true;}
  beginTransform(editable:boolean,busy=false):boolean {if(this.suspended||this.owner!=='none'||this.mode==='sculpt'||!editable||busy)return false;this.owner='transform';return true;}
  beginPreview(editable:boolean,busy=false):boolean {if(this.suspended||this.owner!=='none'||!editable||busy)return false;this.owner='preview';return true;}
  end(owner:'sculpt'|'transform'|'preview'):void {if(this.owner===owner)this.owner='none';}
}
