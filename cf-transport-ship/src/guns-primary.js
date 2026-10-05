// 新主武器的独立轮廓；与 guns.js 共用材质、合批和命名锚点。
import * as THREE from 'three';

export function primaryBuilders({ part, RB, RB1, BX, CZ, CX, profile, anchor, guard, curvedMag }) {
  const grip = (g, m) => {
    part(g, profile(0.036, [[0.025,0.02],[0.053,0.006],[0.075,-0.12],[0.035,-0.13],[0.004,-0.012]],0.003), m.rubber,0,0,0);
    guard(g,m.black,-0.082,0.014,0.009,-0.048,0.019);
    part(g,RB1(0.006,0.027,0.009),m.steel,0,-0.019,-0.018,0.2);
    anchor(g,'grip',0,-0.043,0.043);
  };
  const rail = (g,m,z,len,y) => {
    part(g,RB1(0.031,0.009,len),m.metal,0,y,z);
    for(let d=-len/2;d<len/2;d+=0.025) part(g,BX(0.037,0.006,0.008),m.black,0,y+0.006,z+d);
  };
  const muzzle = (g,m,z,r=0.015) => {
    part(g,CZ(r,0.042),m.metal,0,0.051,z+0.021);
    part(g,CZ(r*0.62,0.003),m.black,0,0.051,z-0.001);
    anchor(g,'muzzle',0,0.051,z-0.007);
  };
  const boxMag = (g,m,z,w=.027,h=.16,d=.06) => {
    const mag=new THREE.Group();mag.name='mag';mag.position.set(0,-0.012,z);g.add(mag);
    part(mag,RB(w,h,d),m.metal,0,-h/2,0);
    part(mag,RB1(w+.006,.012,d+.006),m.black,0,-h,0);
    for(const x of [-w/2,w/2]) for(const dz of [-d*.23,d*.23]) part(mag,BX(.001,.10,.003),m.black,x,-h*.5,dz);
    anchor(mag,'reloadGrip',0,-h*.62,0);anchor(g,'magwell',0,-.012,z);
  };
  const sights = (g,m,front,back,y=.10) => {
    for(const z of [front,back]) {
      part(g,RB1(.024,.023,.028),m.metal,0,y,z);
      for(const x of [-.012,.012]) part(g,BX(.005,.024,.01),m.black,x,y+.018,z);
    }
    part(g,BX(.004,.024,.004),m.steel,0,y+.016,front);
  };
  return {
    scar(m) {
      const g=new THREE.Group();
      part(g,profile(.054,[[-.35,.012],[-.35,.067],[-.32,.094],[.10,.094],[.125,.057],[.105,-.014],[-.13,-.014],[-.17,.006]],.004),m.tan,0,0,0);
      part(g,RB(.047,.035,.17),m.black,0,-.004,-.06);
      grip(g,m); boxMag(g,m,-.105);
      rail(g,m,-.11,.44,.098);
      for(const x of [-.029,.029]) {
        part(g,RB1(.006,.025,.15),m.black,x,.033,-.262);
        for(let z=-.32;z<-.19;z+=.025) part(g,BX(.009,.034,.006),m.metal,x,.033,z);
        for(const z of [-.06,.067]) part(g,CX(.004,.058),m.steel,0,.041,z);
      }
      const stock=profile(.048,[[.12,.073],[.17,.081],[.39,.043],[.405,-.083],[.36,-.10],[.25,-.025],[.145,.012]],.004);
      part(g,stock,m.tan,0,0,0);
      part(g,RB1(.058,.147,.026),m.rubber,0,-.029,.405,-.10);
      part(g,RB1(.06,.025,.13),m.black,0,.066,.245);
      part(g,CX(.015,.066),m.metal,0,.038,.134);
      part(g,CZ(.012,.19),m.steel,0,.051,-.438);muzzle(g,m,-.545);
      sights(g,m,-.30,.07,.108);
      part(g,RB1(.025,.011,.019),m.steel,-.037,.062,-.08,0,0,0,'bolt');
      anchor(g,'fore',0,-.002,-.27);anchor(g,'eject',.031,.062,.008);
      return g;
    },
    qbz95(m) {
      const g=new THREE.Group();
      part(g,profile(.052,[[-.33,.005],[-.33,.066],[-.22,.089],[.23,.089],[.275,.052],[.265,-.064],[.13,-.08],[.05,-.016]],.005),m.black,0,0,0);
      part(g,RB(.06,.11,.11),m.rubber,0,.008,.245);
      part(g,profile(.018,[[-.24,.078],[-.2,.169],[.08,.169],[.13,.075]],.002,[[[-.188,.092],[-.168,.145],[.065,.145],[.09,.092]]]),m.metal,0,0,0);
      grip(g,m);curvedMag(g,m.black,5,0,-.036,.161,.029,.029,.067,.04,m.metal);
      anchor(g,'magwell',0,-.035,.161);
      for(const x of [-.028,.028]) for(let z=-.30;z<-.12;z+=.031) part(g,RB1(.003,.019,.017,.002),m.metal,x,.039,z);
      part(g,CZ(.011,.15),m.steel,0,.051,-.39);muzzle(g,m,-.485);
      part(g,RB1(.026,.043,.03),m.metal,0,.087,-.359);
      sights(g,m,-.358,.052,.113);
      part(g,RB1(.028,.01,.023),m.steel,.032,.062,.095,0,0,0,'bolt');
      part(g,CX(.003,.06),m.steel,0,.023,.058);
      anchor(g,'fore',0,-.008,-.254);anchor(g,'eject',.032,.037,.167);
      return g;
    },
    p90(m) {
      const g=new THREE.Group();
      // 镂空拇指孔和前握持孔塑造 P90 轮廓，顶部弹匣独立动画。
      part(g,profile(.062,[[-.29,.05],[-.265,.087],[.28,.087],[.305,.02],[.295,-.12],[.13,-.135],[.045,-.053],[-.035,-.057],[-.075,-.126],[-.13,-.123],[-.13,-.043],[-.265,-.047]],.004,[[[.066,-.025],[.13,-.015],[.195,-.03],[.197,-.087],[.151,-.098],[.102,-.07]]]),m.black,0,0,0);
      part(g,RB1(.07,.16,.027),m.rubber,0,-.03,.296);
      part(g,profile(.037,[[-.122,.016],[-.145,-.003],[-.151,-.08],[-.127,-.103],[-.095,-.093],[-.09,-.02]],.004),m.rubber,0,0,0);
      part(g,RB1(.03,.014,.02),m.metal,0,-.036,-.053);
      const mag=new THREE.Group();mag.name='mag';mag.position.set(0,.092,.035);g.add(mag);
      part(mag,RB(.057,.032,.385),m.smoke,0,0,0);
      for(const z of [-.20,.197]) part(mag,RB1(.06,.035,.019),m.black,0,0,z);
      for(let z=-.15;z<.18;z+=.027) part(mag,CX(.006,.043,8),m.brass,0,-.001,z);
      anchor(mag,'reloadGrip',-.005,.012,.07);anchor(g,'magwell',0,.087,.035);
      for(const x of [-.027,.027]) part(g,RB1(.016,.046,.098),m.metal,x,.127,-.18);
      part(g,RB1(.074,.027,.094),m.black,0,.164,-.18);
      part(g,RB1(.042,.02,.003),m.glass,0,.153,-.132);
      part(g,CZ(.012,.04),m.steel,0,.051,-.31);muzzle(g,m,-.345,.013);
      for(const x of [-.034,.034]) part(g,RB1(.012,.012,.031),m.metal,x,.075,-.243,0,0,0,x>0?'bolt':undefined);
      anchor(g,'grip',0,-.045,.024);anchor(g,'fore',0,-.051,-.121);anchor(g,'eject',0,-.07,.17);
      return g;
    },
    barrett(m) {
      const g=new THREE.Group();
      part(g,profile(.072,[[-.42,.024],[-.40,.095],[.12,.095],[.16,.05],[.105,-.012],[-.38,-.012]],.004),m.metal,0,0,0);
      grip(g,m);boxMag(g,m,-.104,.047,.115,.098);
      for(const x of [-.038,.038]) for(let z=-.36;z<-.14;z+=.045) part(g,RB1(.003,.025,.03,.003),m.black,x,.058,z);
      part(g,profile(.046,[[.125,.076],[.39,.058],[.412,-.072],[.362,-.09],[.255,-.026],[.14,.013]],.004),m.black,0,0,0);
      part(g,RB1(.062,.15,.028),m.rubber,0,-.018,.408);
      part(g,RB(.056,.033,.14),m.rubber,0,.077,.253);
      part(g,CZ(.018,.42),m.steel,0,.051,-.616);
      part(g,CZ(.025,.047),m.metal,0,.051,-.427);
      part(g,profile(.083,[[-.90,.093],[-.83,.087],[-.82,.014],[-.90,.008]],.003),m.metal,0,0,0);
      for(const x of [-.043,.043]) for(const z of [-.87,-.841]) part(g,RB1(.004,.046,.012),m.black,x,.051,z);
      part(g,CZ(.013,.004),m.black,0,.051,-.904);anchor(g,'muzzle',0,.051,-.912);
      rail(g,m,-.052,.30,.102);
      for(const z of [-.145,.025]) {
        part(g,RB1(.036,.053,.027),m.black,0,.132,z);
        part(g,CZ(.026,.019),m.metal,0,.17,z);
      }
      part(g,CZ(.019,.27),m.black,0,.17,-.08);
      part(g,CZ(.035,.079),m.metal,0,.17,-.239);
      part(g,CZ(.031,.003),m.glass,0,.17,-.281);
      part(g,CZ(.027,.05),m.rubber,0,.17,.076);
      part(g,CZ(.023,.003),m.glass,0,.17,.102);
      part(g,CX(.016,.025),m.black,.028,.17,-.061);
      part(g,RB1(.025,.022,.026),m.black,0,.2,-.061);
      // 收拢的支架沿护木两侧，不增加支架操作机制。
      for(const x of [-.058,.058]) {
        part(g,CX(.012,.024),m.metal,x,-.012,-.355);
        part(g,CZ(.008,.21),m.metal,x,-.03,-.25);
        part(g,RB1(.025,.02,.04),m.rubber,x,-.03,-.142);
      }
      part(g,RB1(.03,.013,.025),m.steel,.047,.061,.009,0,0,0,'bolt');
      anchor(g,'fore',0,-.008,-.302);anchor(g,'eject',.039,.05,-.011);
      return g;
    },
  };
}
