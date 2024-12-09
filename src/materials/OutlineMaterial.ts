

// The material classes in this assignment implement modified versions of the
// toon and outline shading in Assignment 5. The shader code has been obfuscated
// so it can't be used to complete the previous assignment with late points.

import * as gfx from 'gophergfx'
import { ArtisticRendering } from './ArtisticRendering';

export class OutlineMaterial extends gfx.Material3
{
    public color: gfx.Color;
    public thickness: number;
    public baseMaterial: gfx.Material3;

    public static shader = new gfx.ShaderProgram(
        ArtisticRendering.getOutlineVertexShader(), 
        ArtisticRendering.getOutlineFragmentShader()
    );

    private modelUniform: WebGLUniformLocation | null;
    private viewUniform: WebGLUniformLocation | null;
    private projectionUniform: WebGLUniformLocation | null;
    private normalUniform: WebGLUniformLocation | null;
    private colorUniform: WebGLUniformLocation | null;
    private thicknessUniform: WebGLUniformLocation | null;

    private positionAttribute: number;
    private normalAttribute: number;

    constructor(baseMaterial: gfx.Material3)
    {
        super();

        this.baseMaterial = baseMaterial;
        this.color = new gfx.Color(0, 0, 0);
        this.thickness = 0.01;

        this.side = gfx.Side.DOUBLE;

        OutlineMaterial.shader.initialize(this.gl);
        
        this.viewUniform = OutlineMaterial.shader.getUniform(this.gl, 'viewMatrix');
        this.modelUniform = OutlineMaterial.shader.getUniform(this.gl, 'modelMatrix');
        this.projectionUniform = OutlineMaterial.shader.getUniform(this.gl, 'projectionMatrix');
        this.normalUniform = OutlineMaterial.shader.getUniform(this.gl, 'normalMatrix');
        this.colorUniform = OutlineMaterial.shader.getUniform(this.gl, 'materialColor');
        this.thicknessUniform = OutlineMaterial.shader.getUniform(this.gl, 'thickness');

        this.positionAttribute = OutlineMaterial.shader.getAttribute(this.gl, 'position');
        this.normalAttribute = OutlineMaterial.shader.getAttribute(this.gl, 'normal');
    }

    draw(mesh: gfx.Mesh3, camera: gfx.Camera, lightManager: gfx.LightManager): void
    {
        if(!this.visible || mesh.triangleCount == 0)
            return;

        // Now initialize the outline shader
        this.initialize();

        // Switch to this shader
        this.gl.useProgram(OutlineMaterial.shader.getProgram());

        // Set the camera uniforms
        this.gl.uniformMatrix4fv(this.modelUniform, false, mesh.localToWorldMatrix.mat);
        this.gl.uniformMatrix4fv(this.viewUniform, false, camera.viewMatrix.mat);
        this.gl.uniformMatrix4fv(this.projectionUniform, false, camera.projectionMatrix.mat);
        this.gl.uniformMatrix4fv(this.normalUniform, false, mesh.localToWorldMatrix.getInverse().getTranspose().mat);

        // Set the material property uniforms
        this.gl.uniform4f(this.colorUniform, this.color.r, this.color.g, this.color.b, this.color.a);

        // Set the line thickness uniform
        this.gl.uniform1f(this.thicknessUniform, this.thickness);

        // Set the vertex positions
        if (this.positionAttribute != -1) {
            this.gl.enableVertexAttribArray(this.positionAttribute);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.positionBuffer);
            this.gl.vertexAttribPointer(this.positionAttribute, 3, this.gl.FLOAT, false, 0, 0);
        }

        // Set the vertex normals
        if (this.normalAttribute != -1) {
            this.gl.enableVertexAttribArray(this.normalAttribute);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.normalBuffer);
            this.gl.vertexAttribPointer(this.normalAttribute, 3, this.gl.FLOAT, false, 0, 0);
        }
        
        // Draw the triangles
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, mesh.triangleCount*3, this.gl.UNSIGNED_SHORT, 0);

        // Draw the base material
        this.baseMaterial.draw(mesh, camera, lightManager);
    }

    setColor(color: gfx.Color): void
    {
        this.color.copy(color);
    }

    getColor(): gfx.Color
    {
        return this.color;
    }
}