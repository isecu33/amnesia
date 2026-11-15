import json,sys
d=json.load(open(sys.argv[1]))
for k,v in d['actions'].items() if isinstance(d['actions'],dict) else [(a.get('name'),a) for a in d['actions']]:
    print(k,{x:v[x] for x in ('bad_edge_frac','fold_frac','max_growth_cm','worst_frame','accel','frozen_s') if x in v},v['bad_by_bone'])
    for s in v['bad_samples'][:3]: print('   ',s)
