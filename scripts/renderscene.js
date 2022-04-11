let view;
let ctx;
let scene;
let start_time;

const LEFT = 32; // binary 100000
const RIGHT = 16; // binary 010000
const BOTTOM = 8;  // binary 001000
const TOP = 4;  // binary 000100
const FAR = 2;  // binary 000010
const NEAR = 1;  // binary 000001
const FLOAT_EPSILON = 0.000001;

// Initialization function - called when web page loads
function init() {
    // test transforms with console.log(mat4x4perspectvit(etc))
    let w = 800;
    let h = 600;
    view = document.getElementById('view');
    view.width = w;
    view.height = h;

    ctx = view.getContext('2d');

    // initial scene... feel free to change this
    scene = {
        view: {
            type: 'perspective', 
            prp: Vector3(44, 20, -20),
            srp: Vector3(20, 20, -45),
            vup: Vector3(0, 1, 0),
            clip: [-20, 15, -20, 15, 12, 100]
        },
        models: [
            {
                type: 'generic',
                vertices: [
                    Vector4(0, 0, -30, 1),
                    Vector4(20, 0, -30, 1),
                    Vector4(20, 12, -30, 1),
                    Vector4(10, 20, -30, 1),
                    Vector4(0, 12, -30, 1),
                    Vector4(0, 0, -60, 1),
                    Vector4(20, 0, -60, 1),
                    Vector4(20, 12, -60, 1),
                    Vector4(10, 20, -60, 1),
                    Vector4(0, 12, -60, 1)
                ],
                edges: [
                    [0, 1, 2, 3, 4, 0],
                    [5, 6, 7, 8, 9, 5],
                    [0, 5],
                    [1, 6],
                    [2, 7],
                    [3, 8],
                    [4, 9]
                ],
                matrix: new Matrix(4, 4)
            },
            {
                type: "cube",
                center: [0, 20, -30],
                width: 8,
                height: 8,
                depth: 8
            },
            {
                type: "cylinder",
                center: [0, 10, -20],
                radius: 5,
                height: 10,
                sides: 12,
                animation: {
                    axis: "y",
                    rps: 0.5
                }
            }
        ]
    };

    // event handler for pressing arrow keys
    document.addEventListener('keydown', onKeyDown, false);

    // start animation loop
    start_time = performance.now(); // current timestamp in milliseconds
    window.requestAnimationFrame(animate);
}

// Animation loop - repeatedly calls rendering code
function animate(timestamp) {
    // step 1: calculate time (time since start)
    let time = timestamp - start_time;

    // step 2: transform models based on time
    // TODO: implement this!

    // step 3: draw scene
    drawScene();

    // step 4: request next animation frame (recursively calling same function)
    // (may want to leave commented out while debugging initially)
    // window.requestAnimationFrame(animate);
}

// Main drawing code - use information contained in variable `scene`
function drawScene() {
    console.log(scene);
    let projectionType = scene.view.type;
    let transform = new Matrix(4, 4); // N_par or N_per
    let projection_M = new Matrix(4, 4); // M_par or M_per

    // TRANSFORM to the canonical view volume (and also find M_par / M_per)
    if (projectionType == "parallel") {
        transform = mat4x4Parallel(scene.view.prp, scene.view.srp, scene.view.vup, scene.view.clip);
        projection_M = mat4x4MPar();
    } else {
        transform = mat4x4Perspective(scene.view.prp, scene.view.srp, scene.view.vup, scene.view.clip);
        projection_M = mat4x4MPer();
    }

    // CLIP against the canonical view volume
    let models = scene.models; // array of models
    for (let i = 0; i < models.length; i++) { // for each model
        let model = models[i]; // 1 model
        let modelVertices = []; // array of model's vertices
        let modelEdges = []; // array of model's edges

        // Depend on model's type, assign arrays of vertices and edges above
        if (model.type == "generic") {
            modelVertices = model.vertices;
            modelEdges = model.edges;
        } else if (model.type == "cube") {
            let cube = createCube(model.center, model.width, model.height, model.depth);
            modelVertices = cube.vertices;
            modelEdges = cube.edges;
        } else if (model.type == "cylinder") {
            let cylinder = createCylinder(model.center, model.radius, model.height, model.sides);
            modelVertices = cylinder.vertices;
            modelEdges = cylinder.edges;
        }

        //console.log(modelVertices);
        //console.log(modelEdges)

        let vertices = []; // list of vertices after 3D transformation
        let clippedLines = []; // array of edges after clipping

        for (let j = 0; j < modelVertices.length; j++) {
            let vertex = Matrix.multiply([transform, modelVertices[j]]);
            vertices.push(vertex);
        }

        for (let j = 0; j < modelEdges.length; j++) { // for each edge array
            let edges = modelEdges[j]; // edge array
            for (let k = 0; k < edges.length - 1; k++) { // for each edge in array
                let pt0 = vertices[edges[k]]; // endpoint 1 - Vector 4
                let pt1 = vertices[edges[k + 1]]; // endpoint 2 - Vector 4
                let edge = {  // edge with 2 endpoints
                    pt0: pt0,
                    pt1: pt1
                };

                let clippedEdge = null; // clipped edge
                if (projectionType == "parallel") {
                    clippedEdge = clipLineParallel(edge);
                } else {
                    let z_min = -scene.view.clip[4] / scene.view.clip[5];
                    clippedEdge = clipLinePerspective(edge, z_min);
                }
                if(clippedEdge != null) {
                    clippedLines.push(clippedEdge); // add clipped edge to clippedLines array
                }
            }
        }

        // PROJECT to 2D &
        // Translate and scale to the framebuffer bounds ([O, width] and [0,height] respectively).
        let pt0Array = []; // array containing 1st endpoint
        let pt1Array = []; // array containing 2nd endpoint

        let v = new Matrix(4, 4); // matrix for transform and scale to fit the size of screen
        v.values = [[view.width / 2, 0, 0, view.width / 2],
        [0, view.height / 2, 0, view.height / 2],
        [0, 0, 1, 0],
        [0, 0, 0, 1]];

        for (let i = 0; i < clippedLines.length; i++) {
            // Change it back to Vector 4 b/c clippedLines array contains only Vector3's
            let point0 = Vector4(clippedLines[i].pt0.x, clippedLines[i].pt0.y, clippedLines[i].pt0.z, 1);
            let point1 = Vector4(clippedLines[i].pt1.x, clippedLines[i].pt1.y, clippedLines[i].pt1.z, 1);
            pt0Array.push(Matrix.multiply([v, projection_M, point0]));
            pt1Array.push(Matrix.multiply([v, projection_M, point1]));
        }

        // Convert to Cartesian
        for (let i = 0; i < pt0Array.length; i++) {
            // For point 1
            let x0 = pt0Array[i].x / pt0Array[i].w;
            let y0 = pt0Array[i].y / pt0Array[i].w;
            let z0 = pt0Array[i].z / pt0Array[i].w;
            pt0Array[i] = Vector3(x0, y0, z0);

            // For point 2
            let x1 = pt1Array[i].x / pt1Array[i].w;
            let y1 = pt1Array[i].y / pt1Array[i].w;
            let z1 = pt1Array[i].z / pt1Array[i].w;
            pt1Array[i] = Vector3(x1, y1, z1);
        }

        // Draw line
        for (let i = 0; i < pt0Array.length; i++) {
            drawLine(pt0Array[i].x, pt0Array[i].y, pt1Array[i].x, pt1Array[i].y);
        }
    }
}

// CUBE MODEL:
function createCube(center, width, height, depth) {
    // Width = x , height = y, depth = z
    let x = center[0];
    let y = center[1];
    let z = center[2];

    // Center is at (w/2, h/2, d/2)

    let cube = {
        vertices: [
            Vector4(x - width / 2, y - height / 2, z + depth / 2, 1), // low left front
            Vector4(x - width / 2, y + height / 2, z + depth / 2, 1), // high left front
            Vector4(x + width / 2, y + height / 2, z + depth / 2, 1), // high right front
            Vector4(x + width / 2, y - height / 2, z + depth / 2, 1), // low right front

            Vector4(x - width / 2, y - height / 2, z - depth / 2, 1), // low left back
            Vector4(x - width / 2, y + height / 2, z - depth / 2, 1), // high left back
            Vector4(x + width / 2, y + height / 2, z - depth / 2, 1), // high right back
            Vector4(x + width / 2, y - height / 2, z - depth / 2, 1), // low right back
        ],
        edges: [
            [0, 1, 2, 3, 0],
            [4, 5, 6, 7, 4],
            [0, 4],
            [1, 5],
            [2, 6],
            [3, 7],
        ],
    }
    return cube;
}

// CREATE CYLINDER
function createCylinder(center, radius, height, sides) {
    let vertices = [];
    let edges = [];
    let degree = 360 / sides;

    // Find coordinates of points
    for (let i = 0; i < sides; i++) {
        let x = center[0] + Math.cos((Math.PI / 180) * i * degree) * radius;
        let z = center[2] + Math.sin((Math.PI / 180) * i * degree) * radius;
        let y_top = center[1] + height/2;
        let y_bottom = center[1] - height/2;

        vertices.push(Vector4(x, y_top, z, 1));
        vertices.push(Vector4(x, y_bottom, z, 1));
    }

    let arr1 = [];
    let arr2 = [];
    for (let i = 0; i < sides; i++) {
        arr1[i] = 2*i;
        arr2[i] = 2*i + 1;
    }
    arr1.push(0);
    arr2.push(1);
    edges.push(arr1);
    edges.push(arr2);

    for (let i = 0; i < sides; i++) {
        edges.push([i * 2, i * 2 + 1]);
    }

    let cylinder = {
        vertices: vertices,
        edges: edges,
    }
    return cylinder;
}

// Get outcode for vertex (parallel view volume)
function outcodeParallel(vertex) {
    let outcode = 0;
    if (vertex.x < (-1.0 - FLOAT_EPSILON)) {
        outcode += LEFT;
    }
    else if (vertex.x > (1.0 + FLOAT_EPSILON)) {
        outcode += RIGHT;
    }
    if (vertex.y < (-1.0 - FLOAT_EPSILON)) {
        outcode += BOTTOM;
    }
    else if (vertex.y > (1.0 + FLOAT_EPSILON)) {
        outcode += TOP;
    }
    if (vertex.z < (-1.0 - FLOAT_EPSILON)) {
        outcode += FAR;
    }
    else if (vertex.z > (0.0 + FLOAT_EPSILON)) {
        outcode += NEAR;
    }
    return outcode;
}

// Get outcode for vertex (perspective view volume)
function outcodePerspective(vertex, z_min) {
    let outcode = 0;
    if (vertex.x < (vertex.z - FLOAT_EPSILON)) {
        outcode += LEFT;
    }
    else if (vertex.x > (-vertex.z + FLOAT_EPSILON)) {
        outcode += RIGHT;
    }
    if (vertex.y < (vertex.z - FLOAT_EPSILON)) {
        outcode += BOTTOM;
    }
    else if (vertex.y > (-vertex.z + FLOAT_EPSILON)) {
        outcode += TOP;
    }
    if (vertex.z < (-1.0 - FLOAT_EPSILON)) {
        outcode += FAR;
    }
    else if (vertex.z > (z_min + FLOAT_EPSILON)) {
        outcode += NEAR;
    }
    return outcode;
}

// Clip line - should either return a new line (with two endpoints inside view volume) or null (if line is completely outside view volume)
function clipLineParallel(line) {
    let result = null;
    let p0 = Vector3(line.pt0.x, line.pt0.y, line.pt0.z);
    let p1 = Vector3(line.pt1.x, line.pt1.y, line.pt1.z);
    let out0 = outcodeParallel(p0);
    let out1 = outcodeParallel(p1);

    let trivial = false;
    while (!trivial) {
        if (out0 | out1 == 0) {
            result = line;
            trivial = true;
        } else if (out0 & out1 != 0) {
            trivial = true;
        } else {
            // Choose an endpoint outside of the view volume
            let selected = 0;
            let selectedEndpoint = null;
            if (out0 == 0 & out1 != 0) {
                selected = out1;
                selectedEndpoint = p1;
            } else {
                selected = out0;
                selectedEndpoint = p0;
            }

            // Calculate intersection point between line and corresponding edge
            let intersect = new Vector3(0, 0, 0);
            if (selected & LEFT == LEFT || selected & RIGHT == RIGHT) {
                if (selected & LEFT == LEFT) {
                    intersect.x = -1;
                } else {
                    intersect.x = 1;
                }
                t = (intersect.x - p0.x) / (p1.x - p0.x);
                intersect.y = p0.y + t * (p1.y - p0.y);
                intersect.z = p0.z + t * (p1.z - p0.z);
            } else if (selected & BOTTOM == BOTTOM || selected & TOP == TOP) {
                if (selected & BOTTOM == BOTTOM) {
                    intersect.y = -1;
                } else {
                    intersect.y = 1;
                }
                t = (intersect.y - p0.y) / (p1.y - p0.y);
                intersect.x = p0.x + t * (p1.x - p0.x);
                intersect.z = p0.z + t * (p1.z - p0.z);
            } else if (selected & FAR == FAR || selected & NEAR == NEAR) {
                if (selected & FAR == FAR) {
                    intersect.z = -1;
                } else {
                    intersect.z = 0;
                }
                t = (intersect.z - p0.z) / (p1.z - p0.z);
                intersect.x = p0.x + t * (p1.x - p0.x);
                intersect.y = p0.y + t * (p1.y - p0.y);
            }

            // Replace selected endpoint with this intersection point
            if (selectedEndpoint == p0) {
                p0 = intersect;
                out0 = outcodeParallel(p0);
            } else {
                p1 = intersect;
                out1 = outcodeParallel(p1);
            }

            // Create a new line for clipped line
            result = {
                pt0: Vector3(p0.x, p0.y, p0.z),
                pt1: Vector3(p1.x, p1.y, p1.z)
            };
        }
    }
    return result;
}

// Clip line - should either return a new line (with two endpoints inside view volume) or null (if line is completely outside view volume)
function clipLinePerspective(line, z_min) {
    let p0 = Vector3(line.pt0.x, line.pt0.y, line.pt0.z);
    let p1 = Vector3(line.pt1.x, line.pt1.y, line.pt1.z);
    let result = {
        pt0: {
            x: p0.x,
            y: p0.y,
            z: p0.z
        },
        pt1: {
            x: p1.x,
            y: p1.y,
            z: p1.z
        }
    };
    let out0 = outcodePerspective(p0, z_min);
    let out1 = outcodePerspective(p1, z_min);

    let trivial = false;
    let t = 0;
    let deltax = 0;
    let deltay = 0;
    let deltaz = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    // Loop until we get trivial results - first loop will always run
    while (!trivial) {
        if (out0 | out1 == 0) {
            trivial = true;
        }
        else if (out0 & out1 != 0) {
            trivial = true;
            result = null;
        }
        else {
            // choose point on outside, I always choose p0. If p0 is inside, switch with p1
            if (out0 == 0) {
                let temp = Vector3(p0.x, p0.y, p0.z);
                p0 = Vector3(p1.x, p1.y, p1.z);
                p1 = Vector3(temp.x, temp.y, temp.z);
                out0 = outcodePerspective(p0, z_min);
                out1 = outcodePerspective(p1, z_min);
            }
            deltax = p1.x - p0.x;
            deltay = p1.y - p0.y;
            deltaz = p1.z - p0.z;
            let intersect = Vector3(x, y, z);
            // find first bit set to 1, I think they should waterfall down in this order, no extra work needed?? - wrong
            if (out0 & LEFT == LEFT) {
                t = (-p0.x + p0.z) / (deltax - deltaz);
            }
            else if (out0 & RIGHT == RIGHT) {
                t = (p0.x + p0.z) / (-deltax - deltaz);
            }
            else if (out0 & BOTTOM == BOTTOM) {
                t = (-p0.y + p0.z) / (deltay - deltaz);
            }
            else if (out0 & TOP == TOP) {
                t = (p0.y + p0.z) / (-deltay - deltaz);
            }
            else if (out0 & FAR == FAR) {
                t = (-p0.z - 1) / (deltaz);
            }
            else {
                t = (p0.z - z_min) / (-deltaz);
            }
            // calculate intersection point based on t calculated above
            intersect.x = (1 - t) * p0.x + t * p1.x;
            intersect.y = (1 - t) * p0.y + t * p1.y;
            intersect.z = (1 - t) * p0.z + t * p1.z;

            // set my selected point, p0, to the intersection point
            p0 = intersect;

            // Create new line to return
            result = {
                pt0: {
                    x: p0.x,
                    y: p0.y,
                    z: p0.z
                },
                pt1: {
                    x: p1.x,
                    y: p1.y,
                    z: p1.z
                }
            };
            // recalculate endpoint outcode; since I might have switched p0 and p1, I also recalculate for p1
            out0 = outcodePerspective(p0, z_min);
            out1 = outcodePerspective(p1, z_min);
        }
    }
    return result;
}

// Called when user presses a key on the keyboard down 
// add things
function onKeyDown(event) {
    let n_axis = scene.view.prp.subtract(scene.view.srp);
    let u_axis = scene.view.vup.cross(n_axis);
    n_axis.normalize();
    u_axis.normalize();
    let srpHomogenous = new Matrix(4,1);
    srpHomogenous.values = [[scene.view.srp.x], [scene.view.srp.y], [scene.view.srp.z], [1]];
    let rotate = new Matrix(4, 4);
    switch (event.keyCode) {
        case 37: // LEFT Arrow
            console.log("left");
            // this is probably all wrong
            mat4x4RotateZ(rotate, 10);
            let newSRP = Matrix.multiply([rotate, srpHomogenous]);
            scene.view.srp.x = newSRP[0];
            scene.view.srp.y = newSRP[1];
            scene.view.srp.z = newSRP[2];
            break;
        case 39: // RIGHT Arrow
            console.log("right");
            mat4x4RotateY(rotate, 15);

            break;
        case 65: // A key
            console.log("A");
            // PRP and SRP move left (model appears to move right)
            scene.view.prp = scene.view.prp.subtract(u_axis);
            scene.view.srp = scene.view.srp.subtract(u_axis);
            break;
        case 68: // D key
            console.log("D");
            // PRP and SRP move right (model appears to move left)
            scene.view.prp = scene.view.prp.add(u_axis);
            scene.view.srp = scene.view.srp.add(u_axis);
            break;
        case 83: // S key
            console.log("S");
            scene.view.prp = scene.view.prp.add(n_axis);
            scene.view.srp = scene.view.srp.add(n_axis);
            break;
        case 87: // W key
            console.log("W");
            scene.view.prp = scene.view.prp.subtract(n_axis);
            scene.view.srp = scene.view.srp.subtract(n_axis);
            break;
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 800, 600);
    drawScene();
}

///////////////////////////////////////////////////////////////////////////
// No need to edit functions beyond this point
///////////////////////////////////////////////////////////////////////////

// Called when user selects a new scene JSON file
function loadNewScene() {
    let scene_file = document.getElementById('scene_file');

    console.log(scene_file.files[0]);

    let reader = new FileReader();
    reader.onload = (event) => {
        scene = JSON.parse(event.target.result);
        scene.view.prp = Vector3(scene.view.prp[0], scene.view.prp[1], scene.view.prp[2]);
        scene.view.srp = Vector3(scene.view.srp[0], scene.view.srp[1], scene.view.srp[2]);
        scene.view.vup = Vector3(scene.view.vup[0], scene.view.vup[1], scene.view.vup[2]);

        for (let i = 0; i < scene.models.length; i++) {
            if (scene.models[i].type === 'generic') {
                for (let j = 0; j < scene.models[i].vertices.length; j++) {
                    scene.models[i].vertices[j] = Vector4(scene.models[i].vertices[j][0],
                        scene.models[i].vertices[j][1],
                        scene.models[i].vertices[j][2],
                        1);
                }
            }
            else {
                scene.models[i].center = Vector4(scene.models[i].center[0],
                    scene.models[i].center[1],
                    scene.models[i].center[2],
                    1);
            }
            scene.models[i].matrix = new Matrix(4, 4);
        }
    };
    reader.readAsText(scene_file.files[0], 'UTF-8');
}

// Draw black 2D line with red endpoints 
function drawLine(x1, y1, x2, y2) {
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.fillStyle = '#FF0000';
    ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
    ctx.fillRect(x2 - 2, y2 - 2, 4, 4);
}