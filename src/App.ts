 

import * as gfx from 'gophergfx'
import { GUI } from 'dat.gui'
import { Billboard } from './Billboard';
import { Ground } from './Ground';
import { Stroke2D } from './Stroke2D';
import { ToonMaterial } from './materials/ToonMaterial'
import { OutlineMaterial } from './materials/OutlineMaterial'
import { Stroke3DFactory } from './Stroke3DFactory';

// This enumerator is used to keep track of the current drawing state
enum DrawState
{
    NO_DRAWING,
    DRAWING_GROUND_OR_NEW_BILLBOARD,
    DRAWING_ADDITION_TO_BILLBOARD,
    DRAWING_SKY,
}

export class App extends gfx.GfxApp
{
    // This variable determines the distance to perform intersection tests against a sky sphere
    // and also the size of the box mesh that will render the sky color
    private skyRadius: number;

    // The ground mesh, which is wrapped in its own class since it requires some special functionality
    private ground: Ground;

    // The sky box mesh to render the sky color
    private skyBox: gfx.Mesh3;

    // Array to hold all the billboards that have been added to the scene so that they can
    // be rotated to face the camera whenever the camera moves.
    private billboards: Billboard[];

    // The current stroke that is being drawn or null if the user is not currently drawing.
    private currentStroke: Stroke2D | null;

    // If the user draws on top of an existing billboard, this variable will reference the
    // existing billboard so we know its anchor point.
    private targetBillboard: Billboard | null;

    // If the stroke starts on another piece of geometry (the ground or a billboard), then this
    // variable is set to the 3D point found by projecting the first point of the stroke onto
    // that geometry.
    private strokeStartPoint3D: gfx.Vector3;

    // Camera controller with for keyboard/mouse input
    private cameraControls: gfx.FirstPersonControls;

    // Parameter to determine the camera's height above the ground
    private cameraHeight: number;

    // State variable used to remember the current draw mode
    private drawState: DrawState;

    // GUI paremeters
    public groundColor: string;
    public skyColor: string;
    public crayonColor: string;
    public strokeWidth: number;

    // --- Create the App class ---
    constructor()
    {
        // initialize the base class gfx.GfxApp
        super();

        // This sky radius should be as large as possible while staying within the view frustum.
        // If you change this, you will probably also need to change the camera's far clipping distance.
        this.skyRadius = 225;

        this.cameraControls = new gfx.FirstPersonControls(this.camera);
        this.cameraControls.mouseButton = 2;
        this.cameraControls.flyMode = false;
        this.cameraControls.translationSpeed = 5;
        this.cameraHeight = 2.0;

        this.drawState = DrawState.NO_DRAWING;

        this.ground = new Ground(100, 200);

        // We draw the sky box slightly further away than the radius of the sphere used to draw on the sky
        // This ensures that the drawings will always be in front of the sky background
        this.skyBox = gfx.Geometry3Factory.createBox(this.skyRadius*2+1, this.skyRadius*2+1, this.skyRadius*2+1);

        this.skyColor = '#bfeafc';
        this.groundColor = '#400040';
        this.crayonColor = '#219d20';
        this.strokeWidth = 0.02;

        this.billboards = [];
        this.currentStroke = null;
        this.targetBillboard = null;
        this.strokeStartPoint3D = new gfx.Vector3();
    }


    // --- Initialize the graphics scene ---
    createScene(): void 
    {
        // Setup camera
        this.camera.setPerspectiveCamera(60, 1920/1080, .1, this.skyRadius*4)
        this.camera.position.set(0, this.cameraHeight, 3.5);
        this.camera.lookAt(new gfx.Vector3(0, this.cameraHeight, 0));

        // Create the scene lighting
        const sceneLight = new gfx.PointLight();
        sceneLight.ambientIntensity.set(0.75, 0.75, 0.75);
        sceneLight.diffuseIntensity.set(1, 1, 1);
        sceneLight.specularIntensity.set(1, 1, 1);
        sceneLight.position.set(10, 10, 10);
        this.scene.add(sceneLight);

        // Create the sky box
        this.skyBox.material = new gfx.UnlitMaterial();
        this.skyBox.material.setColor(gfx.Color.createFromString(this.skyColor));
        this.skyBox.material.side = gfx.Side.BACK;
        this.scene.add(this.skyBox);

        // Create a toon material for rendering the ground
        const toonMaterial = new ToonMaterial(
            new gfx.Texture('./assets/toonDiffuse.png'),
            new gfx.Texture('./assets/toonSpecular.png'),
        );
        toonMaterial.ambientColor.setFromString(this.groundColor);
        toonMaterial.diffuseColor.set(0.4, 0.4, 0.4);
        toonMaterial.specularColor.set(0, 0, 0);

        // Create an outline material that wraps the toon material
        // and then assign it to the ground mesh
        const outlineMaterial = new OutlineMaterial(toonMaterial);
        outlineMaterial.thickness = 0.1;
        this.ground.material = outlineMaterial;
       
        // Add the ground mesh to the scene
        this.scene.add(this.ground);
 
         // Create the GUI
         const gui = new GUI();
         gui.width = 250;
 
         // Setup the GUI controls
         const controls = gui.addFolder("Harold's Crayons");
         controls.open();
 
         const crayonColorController = controls.addColor(this, 'crayonColor');
         crayonColorController.name('Crayon Color');
 
         const skyColorController = controls.addColor(this, 'skyColor');
         skyColorController.name('Sky Color');
         skyColorController.onChange(() => { 
            this.skyBox.material.setColor(gfx.Color.createFromString(this.skyColor));
          });
 
         const groundColorController = controls.addColor(this, 'groundColor');
         groundColorController.name('Ground Color');   
         groundColorController.onChange(() => { 
            toonMaterial.ambientColor.setFromString(this.groundColor);
         }); 
         
         const strokeWidthController = controls.add(this, 'strokeWidth', 0.01, 0.05);
         strokeWidthController.name('Stroke Width');   
    }

    
    // --- Update is called once each frame by the main graphics loop ---
    update(deltaTime: number): void 
    {
        // Rotate each billboard to face the camera.
        this.billboards.forEach((billboard: Billboard) => {
            billboard.faceCamera(this.camera);
        });

        // Only move the camera if not currently drawing on screen
        if (this.drawState == DrawState.NO_DRAWING) 
        {
            this.cameraControls.update(deltaTime);

            if (this.cameraControls.hasMoved) 
            {

                // This code retrieves the vertices that form the triangle directly underneath
                // the current camera position.  These three vertices are the input needed to
                // perform an intersection test using the ray intersectsTriangle() method.
                const [vertex1, vertex2, vertex3] = this.ground.getTriangleAtPosition(
                    this.camera.position.x, 
                    this.camera.position.z
                );

                // TODO: Part 4: Walking on the Ground

                // Hint: The ray you use to determine the height of the ground at the camera's
                // position is not a pick ray (because it does not pass through a pixel on the 
                // screen).  So, you will want to use the ray set() method, not setPickRay().

				const cameraWorldPosition = this.camera.localToWorldMatrix.transformPoint(gfx.Vector3.ZERO)
				const ray = new gfx.Ray3(new gfx.Vector3(cameraWorldPosition.x, 1000, cameraWorldPosition.z), gfx.Vector3.DOWN);

				const v = ray.intersectsTriangle(vertex1, vertex2, vertex3)
				if (v) {
					this.camera.position.y = v.y + 2;
				}
            }
        }
    }


    onMouseDown(event: MouseEvent): void 
    {
        // Left mouse button is pressed
        if (event.button == 0) 
        {

            // Create a new stroke to store the mouse movements and add it to the scene
            this.currentStroke = new Stroke2D(this.camera, gfx.Color.createFromString(this.crayonColor), this.strokeWidth);
            this.scene.add(this.currentStroke);

            // Get the mouse position in normalized device coordinates, and add it to the stroke
            const screenPt = this.getNormalizedDeviceCoordinates(event.x, event.y);
            this.currentStroke.addPoint(screenPt);

            // Initialize the state to no drawing and determine what state we should be in by 
            // figuring out if the mouse is over an existing billboard, or over the ground, or in the sky. 
            this.drawState = DrawState.NO_DRAWING;

            // Create new pick ray
            const ray = new gfx.Ray3();
            ray.setPickRay(screenPt, this.camera);

            // CASE 1: Perform intersection tests with existing billboards
            for (let i=0; i < this.billboards.length; i++) 
            {
                const billboardIntersection = ray.intersectsMesh3(this.billboards[i].mesh);
                if (billboardIntersection) 
                {
                    this.strokeStartPoint3D = billboardIntersection;
                    this.drawState = DrawState.DRAWING_ADDITION_TO_BILLBOARD;
                    // Save the target billboard
                    this.targetBillboard = this.billboards[i];

                    // We found an intersection, so we can break out of the loop
                    // and avoid wasting computation on more intersection tests.
                    break;
                }
            }

            if(this.drawState == DrawState.NO_DRAWING)
            {
                // CASE 2: Perform intersection test with the triangles in the ground mesh 
                // Because we have stored the vertices and indices of the ground object in CPU memory, we can
                // call the ray.intersectsTriangles() method directly instead of the intersectsMesh() method.
                // Both methods will accomplish the same result, but this is more computationally efficient
                // because it doesn't require copying data from the buffers in GPU memory.
                const groundIntersection = ray.intersectsTriangles(this.ground.vertices, this.ground.indices);
                if (groundIntersection)
                {
                    this.strokeStartPoint3D = groundIntersection;

                    // We don't know yet if this stroke should modify the ground or create a new billboard,
                    // we have to wait until mouseUp to see where the stroke ends.
                    this.drawState = DrawState.DRAWING_GROUND_OR_NEW_BILLBOARD;
                }

                // CASE 3: Drawing on the sky
                // If the ray cast did not intersect the ground mesh, then by process of elimination,
                // we must be drawing on the sky.
                else
                { 
                    this.drawState = DrawState.DRAWING_SKY;
                }
            }
        }
    }


    onMouseMove(event: MouseEvent): void 
    {
        // When the mouse moves while drawing, add another point to the Stroke2D
        if (this.currentStroke && this.drawState != DrawState.NO_DRAWING)
        { 
            const screenPt = this.getNormalizedDeviceCoordinates(event.x, event.y);
            this.currentStroke.addPoint(screenPt);
        }        
    }

    
    onMouseUp(event: MouseEvent): void 
    {
        // Left mouse button is released
        if (event.button == 0 && this.currentStroke) 
        {
            // CASE 1: Treat the stroke as an addition to an existing billboard
            if (this.drawState == DrawState.DRAWING_ADDITION_TO_BILLBOARD && this.targetBillboard)
            {
                const billboard3D = Stroke3DFactory.createBillboard(this.currentStroke,
                    this.camera, this.targetBillboard.anchorPoint
                );
                this.scene.add(billboard3D);
                this.billboards.push(billboard3D);
            }
            
            // CASE 2: Stroke started on the ground, we are either editing ground or creating a new billboard
            else if (this.drawState == DrawState.DRAWING_GROUND_OR_NEW_BILLBOARD)
            {                                
                const screenPt = this.getNormalizedDeviceCoordinates(event.x, event.y);

                const ray = new gfx.Ray3();
                ray.setPickRay(screenPt, this.camera);
                const groundIntersection = ray.intersectsTriangles(this.ground.vertices, this.ground.indices);

                // CASE 2a: Starts on the ground and ends on the ground => edit the ground
                if (groundIntersection) 
                { 
                    if (this.currentStroke.path.length < 6) {
                        console.log("Path is too short to reshape ground.");
                    } else {
                        this.ground.reshapeGround(this.currentStroke, this.strokeStartPoint3D,
                            groundIntersection, this.camera);
                    }
                }

                // CASE 2b: Starts on the ground and ends in the air => create a new billboard
                else 
                {
                    const billboard3D = Stroke3DFactory.createBillboard(this.currentStroke, 
                        this.camera, this.strokeStartPoint3D
                    );
                    this.scene.add(billboard3D);
                    this.billboards.push(billboard3D);
                }
            }

            // CASE 3: Treat the stroke as a sky stroke
            else if (this.drawState == DrawState.DRAWING_SKY) 
            {
                const newSkyStroke = Stroke3DFactory.createSkyStrokeMesh(this.currentStroke, 
                    this.camera, this.skyRadius
                );
                this.scene.add(newSkyStroke);
            }

            // Reset the draw state and remove the 2D stroke from the scene
            this.drawState = DrawState.NO_DRAWING;
            this.currentStroke.remove();
            this.currentStroke = null;
        }
   }
}
