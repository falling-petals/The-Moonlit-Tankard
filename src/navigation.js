// Geometry is expressed in world pixels. Custom obstacles are physical rectangles;
// the same 14px actor clearance is applied to both custom and default furniture.
const STEP=16, RADIUS=14;
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const rect=(x,y,width,height)=>({x,y,width,height});
const DEFAULT_ZONES=[rect(130,345,1275,505),rect(690,840,160,105),rect(550,140,535,65),rect(1065,140,40,225)];
const inside=(p,r)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
function geometry(options={}){
  const b=options.bounds;
  const bounds=b?rect(b.x??b.minX??0,b.y??b.minY??0,b.width??((b.maxX??1536)-(b.x??b.minX??0)),b.height??((b.maxY??1024)-(b.y??b.minY??0))):rect(0,0,1536,1024);
  return {bounds,zones:b?[bounds]:DEFAULT_ZONES,obstacles:navigationObstacles(options)};
}
export function navigationObstacles(options={}){
  let objects=options.obstacles;
  if(!Array.isArray(objects)){
    objects=[rect(490,205,560,125)];
    for(const [x,y] of [[420,470],[1110,470],[420,705],[1110,705]]){
      objects.push(rect(x-75,y-75,150,120),rect(x-134,y-30,58,75),rect(x+76,y-30,58,75));
    }
  }
  return objects.filter(r=>r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>=0&&r.height>=0)
    .map(r=>rect(r.x-RADIUS,r.y-RADIUS,r.width+RADIUS*2,r.height+RADIUS*2));
}
function walkable(p,g){return !!valid(p)&&inside(p,g.bounds)&&g.zones.some(r=>inside(p,r))&&!g.obstacles.some(r=>inside(p,r));}
export function isWalkable(point,options={}){return walkable(point,geometry(options));}
function segment(a,b,g){
  // Cover the entire segment with floor rectangles, including narrow union corners.
  const intervals=[];
  for(const r of g.zones){let lo=0,hi=1;for(const key of ['x','y']){const delta=b[key]-a[key],min=r[key],max=min+(key==='x'?r.width:r.height);if(!delta){if(a[key]<min||a[key]>max){lo=2;break;}}else{const t1=(min-a[key])/delta,t2=(max-a[key])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}}if(lo<=hi)intervals.push([lo,hi]);}
  intervals.sort((u,v)=>u[0]-v[0]);let covered=0;for(const [lo,hi] of intervals){if(lo>covered+1e-10)return false;covered=Math.max(covered,hi);}if(covered<1-1e-10)return false;
  // Sampling checks world bounds as an additional guard.
  const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));
  for(let i=0;i<=count;i++){const t=i/count;if(!walkable({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},g))return false;}
  // Exact rectangle intersection prevents clipping corners between samples.
  for(const r of g.obstacles){let lo=0,hi=1;for(const key of ['x','y']){const delta=b[key]-a[key],min=r[key],max=min+(key==='x'?r.width:r.height);if(!delta){if(a[key]<min||a[key]>max){lo=2;break;}}else{const t1=(min-a[key])/delta,t2=(max-a[key])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}}if(lo<=hi)return false;}
  return true;
}
function grid(g){
  const b=g.bounds;if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<0||b.height<0)return [];
  const cols=Math.floor(b.width/STEP)+1,rows=Math.floor(b.height/STEP)+1;
  if(cols*rows>100000)return [];
  const nodes=[];for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const p={x:b.x+i*STEP,y:b.y+j*STEP};if(walkable(p,g))nodes.push({...p,i,j});}
  return nodes;
}
function nearest(p,g,nodes){
  const b=g.bounds,q={x:Math.max(b.x,Math.min(b.x+b.width,p.x)),y:Math.max(b.y,Math.min(b.y+b.height,p.y))};
  if(walkable(q,g))return q;
  let best=null,dist=Infinity;for(const n of nodes){const d=Math.hypot(n.x-q.x,n.y-q.y);if(d<dist){best={x:n.x,y:n.y};dist=d;}}return best;
}
export function nearestWalkable(point,options={}){if(!valid(point))return null;const g=geometry(options);return nearest(point,g,grid(g));}
export function findPath(start,end,options={}){
  if(!valid(start)||!valid(end))return [];
  const g=geometry(options),nodes=grid(g),a=nearest(start,g,nodes),b=nearest(end,g,nodes);
  if(!a||!b||(a.x===b.x&&a.y===b.y))return [];
  if(segment(a,b,g))return [b];
  const key=n=>`${n.i},${n.j}`,map=new Map(nodes.map(n=>[key(n),n]));
  const near=p=>nodes.filter(n=>Math.hypot(n.x-p.x,n.y-p.y)<=STEP*2&&segment(p,n,g));
  const roots=near(a),ends=new Set(near(b).map(key));if(!roots.length||!ends.size)return [];
  const open=new Set(),cost=new Map(),prev=new Map();
  for(const n of roots){open.add(key(n));cost.set(key(n),Math.hypot(n.x-a.x,n.y-a.y));}
  let goal=null;
  while(open.size){let current=null,score=Infinity;for(const k of open){const n=map.get(k),s=cost.get(k)+Math.hypot(n.x-b.x,n.y-b.y);if(s<score){score=s;current=k;}}
    if(ends.has(current)){goal=current;break;}open.delete(current);const n=map.get(current);
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const k=`${n.i+di},${n.j+dj}`,v=map.get(k);if(!v||!segment(n,v,g))continue;const c=cost.get(current)+Math.hypot(v.x-n.x,v.y-n.y);if(c<(cost.get(k)??Infinity)){cost.set(k,c);prev.set(k,current);open.add(k);}}
  }
  if(!goal)return [];
  const raw=[b];for(let k=goal;k;k=prev.get(k)){const n=map.get(k);raw.unshift({x:n.x,y:n.y});}
  const result=[];let anchor=a,index=0;
  while(index<raw.length){let far=raw.length-1;while(far>index&&!segment(anchor,raw[far],g))far--;result.push(raw[far]);anchor=raw[far];index=far+1;}
  return result;
}
