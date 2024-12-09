 

import * as gfx from 'gophergfx'
import { Stroke2D } from './Stroke2D';

export class Ground extends gfx.Mesh3
{
    public vertices: gfx.Vector3[];
    public normals: gfx.Vector3[];
    public indices: number[];

    private size: number;
    private segments: number;

    constructor(size: number, segments: number)
    {
        super();

        this.size = size;
        this.segments = segments;

        // A simple grid is used to initialize ground geometry.  If it is running too slow,
        // you can turn down the resolution by decreasing the number of segments, but this 
        // will make the hills look more jaggy.  Alternatively, if you have the compute 
        // power on your machine, turning up the number of segments will make the terrain
        // editing look a lot better. 
        this.vertices = [];
        this.normals = [];
        this.indices = [];

        // Compute the grid vertices and normals
        const increment = size / segments;
        for(let i = -size/2; i <= size/2; i += increment) {
            for(let j= -size/2; j <= size/2; j += increment) {
                this.vertices.push(new gfx.Vector3(i, 0, j));
                this.normals.push(new gfx.Vector3(0, 1, 0));
            }
        }

        // Compute the indices for all the grid triangles
        for(let i = 0; i < segments; i++) {
            for(let j = 0; j < segments; j++) {
                // First triangle
                this.indices.push( i * (segments+1) + j);
                this.indices.push( i * (segments+1) + (j+1));
                this.indices.push( (i+1) * (segments+1) + j);
                // Second triangle
                this.indices.push( (i+1) * (segments+1) + j);
                this.indices.push( i * (segments+1) + (j+1));
                this.indices.push( (i+1) * (segments+1) + (j+1));
            }
        }

        this.setVertices(this.vertices);
        this.setNormals(this.normals);
        this.setIndices(this.indices);
    }


    /**
     * This function modifies the vertices of the ground mesh to create a hill or valley 
     * based on the input stroke using the algorithm described in the Harold paper by
     * Cohen et al.
     * 
     * @param stroke2D The stroke drawn by the user with the actual samples of the user's
     * mouse position while drawing stored in stroke2D.path
     * @param groundStartPoint The 3D point on the ground "under" the user's mouse at
     * the start of their stroke.
     * @param groundEndPoint The 3D point on the ground "under" the user's mouse at the
     * end of their stroke.
     * @param camera The camera used while drawing the stroke.
     */
    public reshapeGround(stroke2D: Stroke2D, groundStartPoint: gfx.Vector3,  groundEndPoint: gfx.Vector3, camera: gfx.Camera): void
    {
        // TODO: Part 3: Editing the Ground

        // There are 3 major steps to the algorithm:
        // 1. Define a plane to project the stroke onto.
        // 2. Project the user's stroke onto the projection plane.
        // 3. Loop through all of the vertices of the ground mesh, and adjust the height of each based on 
        // the equations in section 4.5 of the paper.  Note, the equations rely upon a function
        // h(), and we have implemented that for you as computeH() defined below.

		// Step 1: Define the projection plane
		const upVector = new gfx.Vector3(0, 1, 0); // Y-axis
		const planeDirection = gfx.Vector3.normalize(gfx.Vector3.subtract(groundEndPoint, groundStartPoint));
		const planeNormal = gfx.Vector3.normalize(gfx.Vector3.cross(planeDirection, upVector));
		const projectionPlane = { point: groundStartPoint, normal: planeNormal };

		// Step 2: Project the stroke onto the plane to form the silhouette curve
		const ray = new gfx.Ray3();
		const plane = new gfx.Plane3(projectionPlane.point, projectionPlane.normal);
		const silhouetteCurve = stroke2D.path.map(point => {
			ray.setPickRay(point, camera);
			return ray.intersectsPlane(plane);
		}).filter(p => p !== null) as gfx.Vector3[];

		// Step 3: Loop through all ground vertices to adjust their height
		const newVertices = this.vertices.map((vertex, index) => {
			// Convert vertex to gfx.Vector3
			const vertexPosition = new gfx.Vector3(vertex.x, vertex.y, vertex.z);

			// Compute the closest point on the projection plane
			const d = gfx.Vector3.subtract(vertexPosition, projectionPlane.point).dot(projectionPlane.normal);
			const closestPointOnPlane = gfx.Vector3.subtract(vertexPosition, gfx.Vector3.multiplyScalar(projectionPlane.normal, d));

			// Compute h (silhouette height) for the vertex
			const h = this.computeH(closestPointOnPlane, silhouetteCurve, plane);

			// Compute the weight w(d)
			const w = Math.max(0, 1 - (d / 10) ** 2);

			// Compute the new height using the convex combination
			const newHeight = w * h + (1 - w) * vertexPosition.y;

			// Return the updated vertex position
			return new gfx.Vector3(vertex.x, newHeight, vertex.z);
		});

		// Step 4: Update the mesh vertices and recompute normals
		console.log()
		this.setVertices(newVertices);
		this.recomputeNormals();
    }


    /**
     * This implements the "h" term used in the equations described in section 4.5 of the paper. 
     * Three arguments are needed:
     * 
     * @param closestPoint As described in the paper, this is the closest point within
     * the projection plane to the vertex of the mesh that we want to modify.  In other
     * words, it is the perpendicular projection of the vertex we want to modify onto
     * the projection plane.
     * @param silhouetteCurve As described in the paper, the silhouette curve is a 3D version
     * of the curve the user draws with the mouse.  It is formed by projecting the
     * original 2D screen-space curve onto the 3D projection plane. 
     * @param projectionPlane We need to know where the projection plane is in 3D space.
     * 
     * @returns The value of "h"
     */
    private computeH(closestPoint: gfx.Vector3, silhouetteCurve: gfx.Vector3[], projectionPlane: gfx.Plane3): number
    {
        // Define the y axis for a "plane space" coordinate system as a world space vector
        const planeY = new gfx.Vector3(0, 1, 0);

         // Define the x axis for a "plane space" coordinate system as a world space vector
        const planeX = gfx.Vector3.cross(planeY, projectionPlane.normal);
        planeX.normalize();

        // Define the origin for a "plane space" coordinate system as the first point in the curve
        const origin = silhouetteCurve[0];

        // Loop over line segments in the curve. We need to find the one that lies over the point
        // by comparing the "plane space" x value for the start and end of the line segment to the
        // "plane space" x value for the closest point that lies in the projection plane.
        const xTarget = gfx.Vector3.subtract(closestPoint, origin).dot(planeX);
        for(let i=1; i < silhouetteCurve.length; i++)
        {
            const xStart = gfx.Vector3.subtract(silhouetteCurve[i-1], origin).dot(planeX);
            const xEnd = gfx.Vector3.subtract(silhouetteCurve[i], origin).dot(planeX);

            if((xStart <= xTarget) && (xTarget <= xEnd))
            {
                const alpha = (xTarget - xStart) / (xEnd - xStart);
                const yCurve = silhouetteCurve[i-1].y + alpha * (silhouetteCurve[i].y - silhouetteCurve[i-1].y);
                return yCurve - closestPoint.y;
            }
            else if((xEnd <= xTarget) && (xTarget <= xStart))
            {
                const alpha = (xTarget - xEnd) / (xStart - xEnd);
                const yCurve = silhouetteCurve[i].y + alpha * (silhouetteCurve[i-1].y - silhouetteCurve[i].y); 
                return yCurve - closestPoint.y;
            }
        }

        // Return 0 because the point does not lie under the curve
        return 0;
    }


    /**
     * This function loops through all the triangles in the mesh and update the vertex normals.
     * We do this by computing the normal of each triangle and then assigning the value to each
     * vertex normal in the triangle.  If the vertex is used in multiple triangles, then the 
     * normals are averaged together.
     */
    private recomputeNormals(): void
    {
        // Data structures to hold the normal sum and count for each vertex.
        const normalCounts: number[] = [];
        this.normals.forEach((n: gfx.Vector3) => {
            n.set(0, 0, 0);
            normalCounts.push(0);
        });

        // Loop through all the triangles.
        for(let i=0; i < this.indices.length; i+=3) {
            // Get three three vertices in the triangle
            const v1 = this.vertices[this.indices[i]];
            const v2 = this.vertices[this.indices[i+1]];
            const v3 = this.vertices[this.indices[i+2]];

            // Compute two edges fo the triangle
            const edge1 = gfx.Vector3.subtract(v2, v1);
            const edge2 = gfx.Vector3.subtract(v3, v1);

            // The triangle normal is the normalized cross product of the two edges
            const n = gfx.Vector3.cross(edge1, edge2);
            n.normalize();

            // Add the triangle normal to each vertex normal
            this.normals[this.indices[i]].add(n);
            this.normals[this.indices[i+1]].add(n);
            this.normals[this.indices[i+2]].add(n);

            // Increment the count for each vertex normal
            normalCounts[this.indices[i]]++;
            normalCounts[this.indices[i+1]]++;
            normalCounts[this.indices[i+2]]++;
        }

        // Loop through the normals one more time to divide each by its count. This 
        // results in the average normal if the vertex is indexed in multiple triangles.
        for(let i=0; i < this.normals.length; i++) {
            this.normals[i].multiplyScalar(1 / normalCounts[i]);
        }

        // Assign the updated normals to the mesh
        this.setNormals(this.normals);
    }


    /**
     * Returns the vertex positions for the triangle that is part of the ground mesh and located
     * directly under the (x,z) coordinates.
     */
    public getTriangleAtPosition(x: number, z: number): [gfx.Vector3, gfx.Vector3, gfx.Vector3]
    {
        const i = Math.floor((x / this.size + 0.5) * this.segments);
        const j = Math.floor((z / this.size + 0.5) * this.segments);

        // First triangle
        const firstVertex1 = this.vertices[i * (this.segments+1) + j];
        const firstVertex2 = this.vertices[i * (this.segments+1) + (j+1)];
        const firstVertex3 = this.vertices[(i+1) * (this.segments+1) + j];

        // Second triangle
        const secondVertex1 = this.vertices[(i+1) * (this.segments+1) + j];
        const secondVertex2 = this.vertices[i * (this.segments+1) + (j+1)];
        const secondVertex3 = this.vertices[(i+1) * (this.segments+1) + (j+1)];

        const position = new gfx.Vector3(x, 0, z);
        const gridCorner1 = new gfx.Vector3(firstVertex1.x, 0, firstVertex1.z);
        const gridCorner2 = new gfx.Vector3(secondVertex3.x, 0, secondVertex3.z);
        if(position.distanceTo(gridCorner1) <= position.distanceTo(gridCorner2))
        {
            return [firstVertex1, firstVertex2, firstVertex3];
        }
        else
        {
            return [secondVertex1, secondVertex2, secondVertex3];
        }
    }

	public setVertices(vertices: gfx.Vector3[] | number[] | Float32Array, dynamicDraw?: boolean): void {
		super.setVertices(vertices)

		if (vertices.length === 0) {
			this.vertices = [];
		} else if (vertices[0] instanceof gfx.Vector3) {
			this.vertices = vertices as gfx.Vector3[]
		}
		
	}
}
