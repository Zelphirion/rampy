import math

layouts = {
    'current': [
        [-84, 26, 0.3],
        [-76, 34, -0.2],
        [-88, 42, 1.1],
        [-72, 50, 0.6],
        [-80, 58, -0.9],
    ],
    'spread1': [
        [-86, 24, 0.3],
        [-74, 32, -0.2],
        [-90, 44, 1.1],
        [-70, 52, 0.6],
        [-82, 62, -0.9],
    ],
    'spread2': [
        [-88, 22, 0.3],
        [-74, 32, -0.2],
        [-92, 46, 1.1],
        [-70, 54, 0.6],
        [-82, 64, -0.9],
    ],
}
R = 2.1
HL = 6.5

def seg_dist(p1, p2, p3, p4):
    d1 = (p2[0] - p1[0], p2[1] - p1[1])
    d2 = (p4[0] - p3[0], p4[1] - p3[1])
    r = (p1[0] - p3[0], p1[1] - p3[1])
    a = d1[0] * d1[0] + d1[1] * d1[1]
    e = d2[0] * d2[0] + d2[1] * d2[1]
    f = d2[0] * r[0] + d2[1] * r[1]
    if a <= 1e-12 and e <= 1e-12:
        return math.hypot(r[0], r[1])
    if a <= 1e-12:
        s = 0; t = max(0, min(1, f / e))
    else:
        c = d1[0] * r[0] + d1[1] * r[1]
        if e <= 1e-12:
            t = 0; s = max(0, min(1, -c / a))
        else:
            b = d1[0] * d2[0] + d1[1] * d2[1]
            denom = a * e - b * b
            s = max(0, min(1, (b * f - c * e) / denom)) if denom > 1e-12 else 0
            t = (b * s + f) / e
            if t < 0: t = 0; s = max(0, min(1, -c / a))
            elif t > 1: t = 1; s = max(0, min(1, (b - c) / a))
    p1p = (p1[0] + d1[0] * s, p1[1] + d1[1] * s)
    p3p = (p3[0] + d2[0] * t, p3[1] + d2[1] * t)
    return math.hypot(p1p[0] - p3p[0], p1p[1] - p3p[1])

for name, logs in layouts.items():
    print(f'=== {name} ===')
    min_d = 1e9
    for i in range(len(logs)):
        for j in range(i + 1, len(logs)):
            a = logs[i]; b = logs[j]
            ax = (math.sin(a[2]), math.cos(a[2]))
            bx = (math.sin(b[2]), math.cos(b[2]))
            p1 = (a[0] - ax[0]*HL, a[1] - ax[1]*HL)
            p2 = (a[0] + ax[0]*HL, a[1] + ax[1]*HL)
            p3 = (b[0] - bx[0]*HL, b[1] - bx[1]*HL)
            p4 = (b[0] + bx[0]*HL, b[1] + bx[1]*HL)
            d = seg_dist(p1, p2, p3, p4)
            min_d = min(min_d, d)
            status = 'OVERLAP' if d < 2*R else ('tight' if d < 6 else 'ok')
            print(f'  log{i+1}-log{j+1}: dist={d:.2f} {status}')
    print(f'  MIN: {min_d:.2f}\n')