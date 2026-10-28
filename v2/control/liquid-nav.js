/* Local Motion 12.43.0; MIT license: ../docs/MOTION_LICENSE.md.
 * Two interruptible springs shape a single glass lens. Only its mask changes;
 * the tab labels and hit areas never move. No service or framework is required.
 */
(function(){
  'use strict';
  var lens,nav,head,tail,target,width,height,frame=0;
  var reduce=matchMedia('(prefers-reduced-motion:reduce)');
  var svgNS='http://www.w3.org/2000/svg';
  function draw(){
    frame=0;
    var h=Math.max(4,Math.min(nav.clientWidth-width-4,head.get())),t=tail.get();
    // Keep a connected silhouette even when the user skips several tabs.
    t=h+Math.max(-width*.22,Math.min(width*.22,t-h));
    var l=Math.min(h,t),r=Math.max(h,t)+width,m=(l+r)/2;
    var radius=(height-2)/2,span=r-l-2*radius;
    var waist=1+Math.min(1,Math.abs(h-t)/width)*height*.12;
    var a=l+radius+span*.25,b=r-radius-span*.25;
    var d=['M',l+radius,1,'H',a,'C',a+span*.12,1,m-span*.15,waist,m,waist,
      'C',m+span*.15,waist,b-span*.12,1,b,1,'H',r-radius,
      'Q',r-1,1,r-1,height/2,'Q',r-1,height-1,r-radius,height-1,'H',b,
      'C',b-span*.12,height-1,m+span*.15,height-waist,m,height-waist,
      'C',m-span*.15,height-waist,a+span*.12,height-1,a,height-1,'H',l+radius,
      'Q',l+1,height-1,l+1,height/2,'Q',l+1,1,l+radius,1,'Z'].join(' ');
    // Clip-path is the only painted animation: a small, explicitly requested
    // liquid contour. Its fixed box avoids layout work and stretching text.
    lens.style.clipPath="path('"+d+"')";
    lens.querySelector('path').setAttribute('d',d);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
  function init(){
    nav=document.querySelector('.panel-nav');lens=nav.querySelector('.tab-indicator');
    var svg=document.createElementNS(svgNS,'svg'),path=document.createElementNS(svgNS,'path');
    var defs=document.createElementNS(svgNS,'defs'),edge=document.createElementNS(svgNS,'linearGradient');
    edge.id='fbp-nav-edge';edge.setAttribute('x2','0');edge.setAttribute('y2','1');
    [['0%','#ffffff','1'],['65%','#ffffff','.4'],['100%','#657185','.2']].forEach(function(values){
      var stop=document.createElementNS(svgNS,'stop');stop.setAttribute('offset',values[0]);
      stop.setAttribute('stop-color',values[1]);stop.setAttribute('stop-opacity',values[2]);edge.appendChild(stop);
    });
    var fill=document.createElementNS(svgNS,'linearGradient');fill.id='fbp-nav-fill';
    fill.setAttribute('x2','1');fill.setAttribute('y2','1');
    [['0%','.18'],['48%','.06'],['100%','.10']].forEach(function(values){
      var stop=document.createElementNS(svgNS,'stop');stop.setAttribute('offset',values[0]);
      stop.setAttribute('stop-color','#ffffff');stop.setAttribute('stop-opacity',values[1]);fill.appendChild(stop);
    });
    defs.appendChild(edge);defs.appendChild(fill);svg.appendChild(defs);svg.setAttribute('aria-hidden','true');svg.appendChild(path);lens.appendChild(svg);
    lens.dataset.fluid='true';head=Motion.motionValue(0);tail=Motion.motionValue(0);
    head.on('change',schedule);tail.on('change',schedule);
    reduce.addEventListener('change',function(){update(true);});
  }
  function update(instant){
    if(!window.Motion)return false;
    var first=!lens;if(first)init();
    var active=nav.querySelector('[aria-selected=true]');if(!active)return true;
    var x=active.offsetLeft,w=active.offsetWidth,h=active.offsetHeight;
    var resized=width!==w||height!==h;
    width=w;height=h;
    if(first||instant||resized||reduce.matches){
      target=x;head.jump(x);tail.jump(x);draw();return true;
    }
    if(target===x)return true;
    target=x;
    // Motion values preserve presentation position and velocity on retarget.
    Motion.animate(head,x,{type:'spring',visualDuration:.18,bounce:0});
    Motion.animate(tail,x,{type:'spring',visualDuration:.22,bounce:0});
    return true;
  }
  window.FBPLiquidNav={update:update};
})();
