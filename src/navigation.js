// Shared walkable map for keyboard movement, route finding and follower collision.
export const CITY_RX = 31;
export const CITY_RZ = 26.5;
export function isWalkable(x, z, obstacles, gateOpen = true, radius = .34) {
  const entrance = Math.abs(x) < 2.5 - radius && z >= 23 && z < 35;
  if (!entrance && (x / (CITY_RX-radius)) ** 2 + (z / (CITY_RZ-radius)) ** 2 > 1) return false;
  if (!gateOpen && z < 28.2) return false;
  return !obstacles.some(o => x > o.x-o.w/2-radius && x < o.x+o.w/2+radius && z > o.z-o.d/2-radius && z < o.z+o.d/2+radius);
}
export function moveWithCollision(position, dx, dz, obstacles, gateOpen=true, radius=.34) {
  const slices=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));
  for(let i=0;i<slices;i++) {
    if(isWalkable(position.x+dx/slices,position.z,obstacles,gateOpen,radius))position.x+=dx/slices;
    if(isWalkable(position.x,position.z+dz/slices,obstacles,gateOpen,radius))position.z+=dz/slices;
  }
  return position;
}
export function findRoute(start, end, obstacles, gateOpen=true, roads=null) {
  const size=.65, key=(x,z)=>`${x},${z}`, grid=p=>[Math.round(p.x/size),Math.round(p.z/size)];
  const [sx,sz]=grid(start),[ex,ez]=grid(end),startKey=key(sx,sz);
  const open=[{x:sx,z:sz,g:0,f:0,k:startKey}],cost=new Map([[startKey,0]]),parents=new Map(),closed=new Set();
  let found;
  for(let count=0;open.length&&count<22000;count++) {
    let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;
    const n=open.splice(best,1)[0];if(closed.has(n.k))continue;closed.add(n.k);
    if(n.x===ex&&n.z===ez){found=n;break;}
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=n.x+dx,z=n.z+dz,k=key(x,z);
      if(closed.has(k)||!isWalkable(x*size,z*size,obstacles,gateOpen,.48))continue;
      if(dx&&dz&&(!isWalkable(n.x*size,z*size,obstacles,gateOpen,.48)||!isWalkable(x*size,n.z*size,obstacles,gateOpen,.48)))continue;
      const g=n.g+Math.hypot(dx,dz)*(roads&&!roads.has(k)?2.8:1);if(g>=(cost.get(k)??Infinity))continue;
      cost.set(k,g);parents.set(k,n);open.push({x,z,k,g,f:g+Math.hypot(ex-x,ez-z)});
    }
  }
  if(!found)return [];
  const path=[{x:end.x,z:end.z}];let n=found;
  while(n.k!==startKey){path.push({x:n.x*size,z:n.z*size});n=parents.get(n.k);}
  return path.reverse();
}
