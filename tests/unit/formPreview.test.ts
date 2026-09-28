import { describe, it, expect } from "vitest";
import { previewFormValues } from "../../src/security/formPreview";
import type { SecurityFormField } from "../../src/types/security";
const field = (changes: Partial<SecurityFormField> = {}): SecurityFormField => ({ id:"internal-id",pageNumber:1,widgetIndex:0,type:"text",name:"name",label:"Name",value:"Original",options:[],rect:{x0:0,y0:0,x1:200,y1:30},readOnly:false,multiline:false,password:false,comb:false,signed:null,...changes });
describe("Live PDF form preview mapping", () => {
 it("uses actual annotation IDs and pending values, including empty values",()=>{ const widgets=[{id:"12R",subtype:"Widget",fieldName:"name"}]; expect(previewFormValues(widgets,[field()],{"internal-id":"New"})).toEqual([{id:"12R",value:"New"}]); expect(previewFormValues(widgets,[field()],{"internal-id":""})).toEqual([{id:"12R",value:""}]); });
 it("maps on and off checkbox/radio states to native booleans",()=>{ const widget={id:"13R",subtype:"Widget",fieldName:"name",exportValue:"Checked"}; expect(previewFormValues([widget],[field({type:"checkbox"})],{"internal-id":"Checked"})).toEqual([{id:"13R",value:true}]); expect(previewFormValues([widget],[field({type:"checkbox"})],{"internal-id":"Off"})).toEqual([{id:"13R",value:false}]); });
 it("uses export choice values and does not change signatures or unrelated links",()=>{const widgets=[{id:"14R",subtype:"Widget",fieldName:"name"},{id:"link",subtype:"Link",fieldName:"name"}]; expect(previewFormValues(widgets,[field({type:"combobox"})],{"internal-id":"DE"})).toEqual([{id:"14R",value:["DE"]}]); expect(previewFormValues(widgets,[field({type:"signature"})])).toEqual([]);});
});
