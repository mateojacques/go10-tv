import { imageSrc } from '@go10/core/lib/imageSrc'
import './Backdrop.css'

/**
 * Atmospheric wash behind the hero and detail views.
 *
 * The source thumbnails are 368x210. Stretching one to full bleed would look
 * broken, so it is blurred hard and saturated into a colour field instead —
 * the image supplies mood, never detail. The crisp copy of the same art is
 * shown separately at close to its native size.
 */
export function Backdrop({ thumbnail }: { thumbnail: string }) {
  return (
    <div className="go-backdrop" aria-hidden="true">
      <img className="go-backdrop_img" src={imageSrc(thumbnail)} alt="" />
      <div className="go-backdrop_scrim" />
    </div>
  )
}
